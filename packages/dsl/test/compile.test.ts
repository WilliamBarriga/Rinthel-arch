import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

describe('compile: Nodos y specification', () => {
  it('compila un Tipo de nodo y un Nodo a la Fuente canonica', () => {
    const resultado = compile({
      'main.dg': `
        specification {
          node servicio
        }
        model {
          servicio api "API" "Puerta de entrada"
        }
      `,
    });

    expect(resultado.issues).toEqual([]);
    expect(resultado.canonico).toEqual({
      specification: { nodeTypes: [{ name: 'servicio', description: '' }] },
      model: {
        edges: [],
        nodes: [
          {
            id: 'api',
            type: 'servicio',
            title: 'API',
            description: 'Puerta de entrada',
            children: [],
          },
        ],
      },
    });
  });

  it('anida Nodos sin limite y cualifica el id por la jerarquia', () => {
    const { canonico, issues } = compile({
      'main.dg': `
        specification { node servicio node modulo }
        model {
          servicio rinthel {
            servicio api {
              modulo auth
            }
          }
        }
      `,
    });

    expect(issues).toEqual([]);
    const [rinthel] = canonico!.model.nodes;
    expect(rinthel?.id).toBe('rinthel');
    expect(rinthel?.children.map((n) => n.id)).toEqual(['rinthel.api']);
    expect(rinthel?.children[0]?.children.map((n) => n.id)).toEqual(['rinthel.api.auth']);
  });

  it('usa el nombre como titulo cuando el Nodo no declara uno', () => {
    const { canonico } = compile({
      'main.dg': 'specification { node servicio } model { servicio api }',
    });

    expect(canonico?.model.nodes[0]).toMatchObject({ id: 'api', title: 'api', description: '' });
  });

  it('lee icono, estilo y color de Paleta de un Tipo de nodo', () => {
    const { canonico } = compile({
      'main.dg': `
        specification {
          node servicio {
            description "Proceso desplegable"
            icon "server"
            style "rounded"
            color blue
          }
        }
      `,
    });

    expect(canonico?.specification.nodeTypes).toEqual([
      {
        name: 'servicio',
        description: 'Proceso desplegable',
        icon: 'server',
        style: 'rounded',
        color: 'blue',
      },
    ]);
  });

  it('un Tipo de nodo no declarado produce E_UNKNOWN_NODE_TYPE con su posicion exacta', () => {
    const resultado = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  servico api', '}'].join('\n'),
    });

    expect(resultado.canonico).toBeUndefined();
    expect(resultado.issues).toHaveLength(1);
    expect(resultado.issues[0]).toMatchObject({
      code: 'E_UNKNOWN_NODE_TYPE',
      severity: 'error',
      file: 'main.dg',
      line: 3,
      column: 3,
    });
  });

  it('un error de sintaxis es un issue con posicion, no una excepcion', () => {
    const resultado = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  servicio "api"', '}'].join('\n'),
    });

    expect(resultado.canonico).toBeUndefined();
    expect(resultado.issues[0]).toMatchObject({
      code: 'E_SYNTAX_ERROR',
      severity: 'error',
      file: 'main.dg',
      // `servicio "api"` es un prefijo valido de Arista (`servicio "1" -> ...`):
      // el parser solo se queja al llegar al `}` que cierra el bloque.
      line: 4,
      column: 1,
    });
  });

  it('une los archivos del Workspace: el catalogo y los Nodos de todos cuentan', () => {
    const { canonico, issues } = compile({
      'b/modelo.dg': 'model { servicio api }',
      'a/tipos.dg': 'specification { node servicio }',
    });

    expect(issues).toEqual([]);
    expect(canonico?.specification.nodeTypes.map((t) => t.name)).toEqual(['servicio']);
    expect(canonico?.model.nodes.map((n) => n.id)).toEqual(['api']);
  });

  it('informa los issues de todos los archivos en orden determinista', () => {
    const { issues } = compile({
      'z.dg': 'model { fantasma x }',
      'a.dg': 'model {\n  fantasma y\n}',
    });

    expect(issues.map((i) => [i.file, i.line, i.code])).toEqual([
      ['a.dg', 2, 'E_UNKNOWN_NODE_TYPE'],
      ['z.dg', 1, 'E_UNKNOWN_NODE_TYPE'],
    ]);
  });

  it('un bloque sin cerrar al final del texto da E_SYNTAX_ERROR con posicion valida', () => {
    const resultado = compile({ 'main.dg': 'specification { node servicio }\nmodel {\n  servicio api {' });

    expect(resultado.canonico).toBeUndefined();
    expect(resultado.issues).toHaveLength(1);
    expect(resultado.issues[0]).toMatchObject({ code: 'E_SYNTAX_ERROR', file: 'main.dg', line: 3 });
    expect(resultado.issues[0]?.column).toBeGreaterThanOrEqual(1);
  });
});

describe('compile: Aristas', () => {
  const spec = 'specification { node servicio node base }';

  it('compila una Arista entre Nodos a la Fuente canonica', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api -> db
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.edges).toEqual([{ from: { node: 'api' }, to: { node: 'db' } }]);
  });

  it('lee la cardinalidad opcional de cada extremo', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api "1" -> "N" db
          db -> "0..1" api
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.edges).toEqual([
      { from: { node: 'api' }, to: { node: 'db' }, fromCardinality: '1', toCardinality: 'N' },
      { from: { node: 'db' }, to: { node: 'api' }, toCardinality: '0..1' },
    ]);
  });

  it('resuelve extremos con id cualificado por la jerarquia', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio rinthel { servicio api }
          base db
          rinthel.api -> db
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.edges?.[0]?.from).toEqual({ node: 'rinthel.api' });
  });

  it('un Modelo sin Aristas da una lista vacia', () => {
    const { canonico } = compile({ 'main.dg': `${spec} model { servicio api }` });
    expect(canonico?.model.edges).toEqual([]);
  });

  it('un extremo inexistente es E_DANGLING_EDGE con la posicion del extremo', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
model {
  servicio api
  api -> nada
}`,
    });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'E_DANGLING_EDGE',
      severity: 'error',
      file: 'main.dg',
      line: 4,
      column: 10,
    });
    expect(issues[0]?.fix).toBeUndefined();
  });

  it('con un unico candidato cercano ofrece un fix sobre el extremo', () => {
    const { issues } = compile({
      'main.dg': `${spec}
model {
  servicio api
  base db
  api -> dbb
}`,
    });

    expect(issues[0]?.code).toBe('E_DANGLING_EDGE');
    expect(issues[0]?.fix).toEqual({
      file: 'main.dg',
      range: { start: { line: 5, column: 10 }, end: { line: 5, column: 13 } },
      replacement: 'db',
    });
  });

  it('con varios candidatos igual de cercanos no hay fix, solo hint', () => {
    const { issues } = compile({
      'main.dg': `${spec}
model {
  servicio ab
  servicio ac
  ab -> ad
}`,
    });

    expect(issues[0]?.fix).toBeUndefined();
    expect(issues[0]?.hint).toContain('ab');
  });

  it('informa ambos extremos colgantes', () => {
    const { issues } = compile({ 'main.dg': `${spec} model { x -> y }` });
    expect(issues.map((i) => i.code)).toEqual(['E_DANGLING_EDGE', 'E_DANGLING_EDGE']);
  });
});
