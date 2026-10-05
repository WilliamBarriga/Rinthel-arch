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
      line: 3,
      column: 12,
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
});
