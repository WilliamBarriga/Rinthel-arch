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
            attributes: [],
            source: [],
            children: [],
          },
        ],
      },
      views: [],
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

  it('un typo de Tipo de nodo con un unico candidato emite fix sobre el texto', () => {
    const { issues } = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  servico api', '}'].join('\n'),
    });

    expect(issues[0]?.fix).toEqual({
      file: 'main.dg',
      range: { start: { line: 3, column: 3 }, end: { line: 3, column: 10 } },
      replacement: 'servicio',
    });
    expect(issues[0]?.hint).toBeUndefined();
  });

  it('con dos candidatos de Tipo de nodo no emite fix, solo hint', () => {
    const { issues } = compile({
      'main.dg': ['specification { node servicio node servicios }', 'model {', '  servici api', '}'].join('\n'),
    });

    expect(issues[0]?.code).toBe('E_UNKNOWN_NODE_TYPE');
    expect(issues[0]?.fix).toBeUndefined();
    expect(issues[0]?.hint).toBe('Candidatos: servicio, servicios');
  });

  it('un Tipo de nodo sin parecido no emite fix ni hint', () => {
    const { issues } = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  zzz api', '}'].join('\n'),
    });

    expect(issues[0]?.fix).toBeUndefined();
    expect(issues[0]?.hint).toBeUndefined();
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

describe('compile: Atributos', () => {
  const spec = 'specification { node tabla node servicio }';

  it('conserva orden, tipo y notas de los Atributos de un Nodo', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios "Usuarios" {
            attrs {
              id: uuid "clave primaria"
              email: text
              creado: timestamp "UTC"
            }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes[0]?.attributes).toEqual([
      { name: 'id', type: 'uuid', notes: 'clave primaria' },
      { name: 'email', type: 'text', notes: '' },
      { name: 'creado', type: 'timestamp', notes: 'UTC' },
    ]);
  });

  it('un Atributo no es un Nodo hijo: no aparece en children ni en el Modelo', () => {
    const { canonico } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios {
            attrs { id: uuid }
            tabla perfil
          }
        }`,
    });

    const [usuarios] = canonico!.model.nodes;
    expect(usuarios?.children.map((n) => n.id)).toEqual(['usuarios.perfil']);
    expect(usuarios?.attributes.map((a) => a.name)).toEqual(['id']);
  });

  it('un Nodo sin attrs tiene lista vacia de Atributos', () => {
    const { canonico } = compile({ 'main.dg': `${spec} model { tabla t }` });
    expect(canonico?.model.nodes[0]?.attributes).toEqual([]);
  });

  it('una Arista a nodo#atributo compila con el Atributo en el extremo', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios { attrs { id: uuid } }
          tabla pedidos { attrs { usuario_id: uuid } }
          pedidos#usuario_id "N" -> "1" usuarios#id
          pedidos -> usuarios#id
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.edges).toEqual([
      {
        from: { node: 'pedidos', attribute: 'usuario_id' },
        to: { node: 'usuarios', attribute: 'id' },
        fromCardinality: 'N',
        toCardinality: '1',
      },
      { from: { node: 'pedidos' }, to: { node: 'usuarios', attribute: 'id' } },
    ]);
  });

  it('un Atributo inexistente es E_UNKNOWN_ATTRIBUTE con la posicion del Atributo', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
model {
  tabla usuarios { attrs { id: uuid } }
  tabla pedidos
  pedidos -> usuarios#idd
}`,
    });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'E_UNKNOWN_ATTRIBUTE',
      severity: 'error',
      file: 'main.dg',
      line: 5,
      column: 23,
      fix: {
        file: 'main.dg',
        range: { start: { line: 5, column: 23 }, end: { line: 5, column: 26 } },
        replacement: 'id',
      },
    });
  });

  it('un Nodo hijo no vale como Atributo, ni un Atributo como Nodo hijo', () => {
    const { issues } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios {
            attrs { id: uuid }
            tabla perfil
          }
          tabla pedidos
          pedidos -> usuarios#perfil
          pedidos -> usuarios.id
        }`,
    });

    expect(issues.map((i) => i.code).sort()).toEqual(['E_DANGLING_EDGE', 'E_UNKNOWN_ATTRIBUTE']);
  });

  it('con el Nodo inexistente solo informa E_DANGLING_EDGE, no el Atributo', () => {
    const { issues } = compile({ 'main.dg': `${spec} model { tabla a  a -> nada#x }` });
    expect(issues.map((i) => i.code)).toEqual(['E_DANGLING_EDGE']);
  });
});

describe('compile: source', () => {
  const spec = 'specification { node servicio }';

  it('compila varios source de un Nodo a una lista {kind, ref} en orden', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api {
            source { git "src/api.ts" }
            source { url "https://ejemplo.com/api" doc "docs/api.md" }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes[0]?.source).toEqual([
      { kind: 'git', ref: 'src/api.ts' },
      { kind: 'url', ref: 'https://ejemplo.com/api' },
      { kind: 'doc', ref: 'docs/api.md' },
    ]);
  });

  it('un Nodo sin source tiene la lista vacia', () => {
    const { canonico } = compile({ 'main.dg': `${spec} model { servicio api }` });
    expect(canonico?.model.nodes[0]?.source).toEqual([]);
  });

  it('guarda kind y ref sin interpretarlos', () => {
    const { canonico } = compile({
      'main.dg': `${spec} model { servicio api { source { cualquier-cosa "  ../x:y#z  " } } }`,
    });
    expect(canonico?.model.nodes[0]?.source).toEqual([{ kind: 'cualquier-cosa', ref: '  ../x:y#z  ' }]);
  });

  it('un ref que no es cadena es E_SYNTAX_ERROR con posicion', () => {
    const { issues, canonico } = compile({
      'main.dg': `${spec}
        model {
          servicio api {
            source { git 42 }
          }
        }`,
    });

    expect(canonico).toBeUndefined();
    expect(issues.every((issue) => issue.code === 'E_SYNTAX_ERROR')).toBe(true);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 4, column: 26 });
  });
});

describe('compile: Workspace multiarchivo', () => {
  it('fusiona specification, Nodos y Aristas de varios archivos en un solo Modelo', () => {
    const { canonico, issues } = compile({
      'tipos.dg': 'specification { node servicio }',
      'nodos.dg': 'model { servicio api  servicio db }',
      'aristas.dg': 'model { api -> db }',
    });

    expect(issues).toEqual([]);
    expect(canonico?.specification.nodeTypes.map((t) => t.name)).toEqual(['servicio']);
    expect(canonico?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(canonico?.model.edges).toEqual([{ from: { node: 'api' }, to: { node: 'db' } }]);
  });

  it('extend anade hijos, Atributos y source a un Nodo de otro archivo', () => {
    const { canonico, issues } = compile({
      'a.dg': 'specification { node servicio }  model { servicio api { servicio auth } }',
      'b.dg': `model {
        extend api {
          servicio cache
          attrs { puerto: int }
          source { git "src/api.ts" }
        }
        extend api.auth { servicio tokens }
      }`,
    });

    expect(issues).toEqual([]);
    const api = canonico?.model.nodes[0];
    expect(api?.children.map((n) => n.id)).toEqual(['api.auth', 'api.cache']);
    expect(api?.attributes).toEqual([{ name: 'puerto', type: 'int', notes: '' }]);
    expect(api?.source).toEqual([{ kind: 'git', ref: 'src/api.ts' }]);
    expect(api?.children[0]?.children.map((n) => n.id)).toEqual(['api.auth.tokens']);
  });

  it('un extend puede estar en un archivo que se lee antes que el Nodo', () => {
    const { canonico, issues } = compile({
      'a-extiende.dg': 'model { extend api { servicio cache } }',
      'z-define.dg': 'specification { node servicio }  model { servicio api }',
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes[0]?.children.map((n) => n.id)).toEqual(['api.cache']);
  });

  it('un extend puede apuntar a un Nodo creado por otro extend, en cualquier orden de archivos', () => {
    const base = { 'a.dg': 'model { extend api.cache { servicio x } }', 'z.dg': 'specification { node servicio }  model { servicio api  extend api { servicio cache } }' };
    const { canonico, issues } = compile(base);

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes[0]?.children[0]?.children.map((n) => n.id)).toEqual(['api.cache.x']);
  });

  it('un Nodo duplicado sin extend es E_DUPLICATE_NODE con related al original', () => {
    const { issues, canonico } = compile({
      'a.dg': 'specification { node servicio }\nmodel {\n  servicio api\n}',
      'b.dg': 'model {\n  servicio db\n  servicio api\n}',
    });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'E_DUPLICATE_NODE',
      severity: 'error',
      file: 'b.dg',
      line: 3,
      column: 12,
      related: [{ file: 'a.dg', line: 3, column: 12 }],
    });
  });

  it('detecta duplicados dentro de un mismo archivo y entre hijos', () => {
    const { issues } = compile({
      'a.dg': `specification { node servicio }
        model {
          servicio api { servicio x  servicio x }
          servicio api
        }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_DUPLICATE_NODE', 'E_DUPLICATE_NODE']);
  });

  it('un extend cuyo Nodo no existe es E_UNKNOWN_EXTEND_TARGET', () => {
    const { issues } = compile({
      'a.dg': 'specification { node servicio }\nmodel {\n  extend nada { servicio x }\n}',
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_EXTEND_TARGET', file: 'a.dg', line: 3, column: 10 });
  });

  it('el resultado no depende del orden en que se pasan los archivos', () => {
    const archivos: [string, string][] = [
      ['a.dg', 'specification { node servicio }  model { servicio api }'],
      ['b.dg', 'model { extend api { servicio cache } servicio db }'],
      ['c.dg', 'model { extend api { servicio cola } api -> db }'],
    ];
    const resultados = [archivos, [...archivos].reverse(), [archivos[1], archivos[2], archivos[0]]].map(
      (orden) => compile(Object.fromEntries(orden as [string, string][])),
    );

    expect(resultados[0]?.issues).toEqual([]);
    expect(resultados[1]).toEqual(resultados[0]);
    expect(resultados[2]).toEqual(resultados[0]);
  });

  it('el duplicado se resuelve igual sin importar el orden de los archivos', () => {
    const base = { 'x.dg': 'model { servicio api }', 'y.dg': 'specification { node servicio }  model { servicio api }' };
    const invertido = { 'y.dg': base['y.dg'], 'x.dg': base['x.dg'] };

    expect(compile(invertido)).toEqual(compile(base));
  });
});

describe('compile: Vistas', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b }';

  it('compila view con type, include, exclude y depth', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base}
        view general {
          type architecture
          include a.*, b.**, c
          exclude b
          depth 2
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views).toEqual([
      { id: 'general', type: 'architecture', include: ['a.*', 'b.**', 'c'], exclude: ['b'], depth: 2 },
    ]);
  });

  it('una Vista flow solo con type; el resto queda vacio', () => {
    const { canonico } = compile({ 'main.dg': `${base} view f { type flow }` });

    expect(canonico?.views).toEqual([{ id: 'f', type: 'flow', include: [], exclude: [] }]);
  });

  it('acepta `*` y `**` como selectores y varios include', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base} view t { type flow  include *  include ** }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.include).toEqual(['*', '**']);
  });

  it('type ausente es E_UNKNOWN_VIEW_TYPE con posicion', () => {
    const { issues, canonico } = compile({
      'main.dg': `${base}\nview sin_tipo {\n  include a\n}`,
    });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_VIEW_TYPE', file: 'main.dg', line: 2, column: 6 });
  });

  it('type desconocido es E_UNKNOWN_VIEW_TYPE en la posicion del valor', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type secuencia\n}`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_VIEW_TYPE', line: 3, column: 8 });
  });

  it('depth 0 es sintacticamente valido y no hace lanzar a compile', () => {
    const { canonico, issues } = compile({ 'main.dg': `${base} view v { type flow  include **  depth 0 }` });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.depth).toBe(0);
  });

  it('fusiona Vistas de varios archivos', () => {
    const { canonico, issues } = compile({
      'a.dg': base,
      'b.dg': 'view uno { type flow }',
      'c.dg': 'view dos { type architecture }',
    });

    expect(issues).toEqual([]);
    expect(canonico?.views.map((v) => v.id)).toEqual(['uno', 'dos']);
  });
});
