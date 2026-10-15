import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, resolveView, revealAt } from 'canonico';
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
      themes: [TEMA_NEUTRO],
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

  it('acepta como nombre de Atributo o de Nodo las palabras de nivel superior (model, node, specification)', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          base model { attrs { model: text  node: text  specification: int } }
          servicio node
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes.map((n) => n.id)).toEqual(['model', 'node']);
    expect(canonico?.model.nodes[0]?.attributes.map((a) => a.name)).toEqual(['model', 'node', 'specification']);
  });

  it('compila la etiqueta de una Arista, con o sin cardinalidad', () => {
    const { canonico, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api -> db "lee y escribe"
          db "1" -> "N" api "devuelve"
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.model.edges).toEqual([
      { from: { node: 'api' }, to: { node: 'db' }, label: 'lee y escribe' },
      { from: { node: 'db' }, to: { node: 'api' }, fromCardinality: '1', toCardinality: 'N', label: 'devuelve' },
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
      (orden) => {
        const { ubicar: _ubicar, ...resultado } = compile(Object.fromEntries(orden as [string, string][]));
        return resultado;
      },
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
      { id: 'general', type: 'architecture', include: ['a.*', 'b.**', 'c'], exclude: ['b'], depth: 2, overrides: [], collapsed: [], expanded: [], links: [], steps: [] },
    ]);
  });

  it('una Vista flow solo con type; el resto queda vacio', () => {
    const { canonico } = compile({ 'main.dg': `${base} view f { type flow }` });

    expect(canonico?.views).toEqual([{ id: 'f', type: 'flow', include: [], exclude: [], overrides: [], collapsed: [], expanded: [], links: [], steps: [] }]);
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

describe('compile: overrides de presentacion por Nodo en la Vista', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b }';

  it('compila label, pin, order y color a la Vista sin tocar el Modelo', () => {
    const sin = compile({ 'main.dg': `${base} view v { type architecture include ** }` });
    const { canonico, issues } = compile({
      'main.dg': `${base}
        view v {
          type architecture
          include **
          node a.x { label "Equis" pin 120,40 order 2 color blue }
          node b { color red }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.overrides).toEqual([
      { node: 'a.x', label: 'Equis', pin: { x: 120, y: 40 }, order: 2, color: 'blue' },
      { node: 'b', color: 'red' },
    ]);
    expect(canonico?.model).toEqual(sin.canonico?.model);
  });

  it('informa la posicion de cada override con pin, para que otros comandos situen sus avisos', () => {
    const { pins } = compile({
      'main.dg': `${base}
view v {
  type architecture
  include **
  node a.x { label "Equis" }
  node b { pin 5,6 }
}`,
    });

    expect(pins).toEqual([{ view: 'v', node: 'b', file: 'main.dg', line: 6, column: 8 }]);
  });

  it('una Vista sin overrides los deja vacios', () => {
    const { canonico } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonico?.views[0]?.overrides).toEqual([]);
  });

  it('override sobre un Nodo fuera de la Vista es E_OVERRIDE_OUTSIDE_VIEW con posicion', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  include a\n  node b { color red }\n}`,
    });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'E_OVERRIDE_OUTSIDE_VIEW',
      severity: 'error',
      file: 'main.dg',
      line: 5,
      column: 8,
    });
  });

  it('override sobre un Nodo inexistente tambien es E_OVERRIDE_OUTSIDE_VIEW', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** node fantasma { label "x" } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_OVERRIDE_OUTSIDE_VIEW']);
  });

  it('color solo acepta nombres de Paleta: un hex es E_UNKNOWN_PALETTE_COLOR', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** node a { color "#ff0000" } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_PALETTE_COLOR']);
  });

  it('pin admite coordenadas negativas', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base} view v { type flow include ** node a { pin -10,-5 } }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.overrides[0]?.pin).toEqual({ x: -10, y: -5 });
  });
});

describe('compile: Tema', () => {
  const base = 'specification { node servicio { color blue } }  model { servicio a }';
  const claro = 'theme claro { palette { blue "#0000ff"  danger "#ff0000" } fonts { body "Inter" } tokens { surface "#ffffff" } }';

  it('un Workspace sin theme usa el Tema neutro', () => {
    const { canonico, issues } = compile({ 'main.dg': base });

    expect(issues).toEqual([]);
    expect(canonico?.themes).toEqual([TEMA_NEUTRO]);
  });

  it('compila palette, fonts y tokens a un objeto plano', () => {
    const { canonico, issues } = compile({ 'main.dg': `${base} ${claro}` });

    expect(issues).toEqual([]);
    expect(canonico?.themes.find((t) => t.name === 'claro')).toEqual({
      name: 'claro',
      palette: { blue: '#0000ff', danger: '#ff0000' },
      fonts: { body: 'Inter' },
      tokens: { surface: '#ffffff' },
    });
  });

  it('extends hereda de un solo padre y el hijo gana; el resultado ya esta resuelto', () => {
    const { canonico, issues } = compile({
      'a.dg': `${base} ${claro}`,
      'b.dg': 'theme oscuro extends claro { palette { blue "#00aaff" } tokens { surface "#111111" } }',
    });

    expect(issues).toEqual([]);
    expect(canonico?.themes.find((t) => t.name === 'oscuro')).toEqual({
      name: 'oscuro',
      palette: { blue: '#00aaff', danger: '#ff0000' },
      fonts: { body: 'Inter' },
      tokens: { surface: '#111111' },
    });
  });

  it('un Tema puede extender el neutro', () => {
    const { canonico, issues } = compile({ 'main.dg': `${base} theme t extends neutral { palette { teal "#008080" } }` });

    expect(issues).toEqual([]);
    expect(canonico?.themes.find((t) => t.name === 't')?.palette).toEqual({
      ...TEMA_NEUTRO.palette,
      teal: '#008080',
    });
  });

  it('tema duplicado es E_DUPLICATE_THEME con related a la primera declaracion', () => {
    const { issues } = compile({ 'main.dg': `${base}\n${claro}\ntheme claro { }` });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_DUPLICATE_THEME', file: 'main.dg', line: 3 });
    expect(issues[0]?.related?.[0]).toMatchObject({ file: 'main.dg', line: 2 });
  });

  it('declarar `neutral` es duplicado del Tema por defecto', () => {
    const { issues } = compile({ 'main.dg': `${base} theme neutral { }` });

    expect(issues.map((i) => i.code)).toEqual(['E_DUPLICATE_THEME']);
  });

  it('ciclo de extends es E_EXTENDS_CYCLE', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base}\ntheme a extends b { }\ntheme b extends a { }`,
    });

    expect(canonico).toBeUndefined();
    expect(issues.map((i) => i.code)).toEqual(['E_EXTENDS_CYCLE', 'E_EXTENDS_CYCLE']);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 2 });
  });

  it('extends de un tema inexistente es E_UNKNOWN_THEME', () => {
    const { issues } = compile({ 'main.dg': `${base} theme a extends fantasma { }` });

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_THEME']);
  });

  it('una Vista puede elegir su theme; uno inexistente es E_UNKNOWN_THEME', () => {
    const bien = compile({ 'main.dg': `${base} ${claro} view v { type flow theme claro }` });
    const mal = compile({ 'main.dg': `${base} view v { type flow theme claroo }` });

    expect(bien.issues).toEqual([]);
    expect(bien.canonico?.views[0]?.theme).toBe('claro');
    expect(mal.issues.map((i) => i.code)).toEqual(['E_UNKNOWN_THEME']);
  });

  it('color de Tipo de nodo desconocido es E_UNKNOWN_PALETTE_COLOR con fix si hay un candidato', () => {
    const { issues } = compile({ 'main.dg': 'specification { node servicio { color blu } }  model { servicio a }' });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_PALETTE_COLOR', file: 'main.dg' });
    expect(issues[0]?.fix?.replacement).toBe('blue');
  });

  it('un hex fuera del Tema nunca es un color valido', () => {
    const { issues } = compile({ 'main.dg': 'specification { node servicio { color "#ff0000" } }  model { servicio a }' });

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_PALETTE_COLOR']);
  });

  it('color de override se valida contra la Paleta del theme de la Vista', () => {
    const vista = (tema: string) =>
      `${base} ${claro} view v { type flow include ** theme ${tema} node a { color danger } }`;

    expect(compile({ 'main.dg': vista('claro') }).issues).toEqual([]);
    expect(compile({ 'main.dg': vista('neutral') }).issues.map((i) => i.code)).toEqual(['E_UNKNOWN_PALETTE_COLOR']);
  });
});
describe('compile: iconos', () => {
  const nodo = (icono: string) => `specification { node servicio { icon ${icono} } }  model { servicio a }`;

  it('acepta una clave de los iconos genericos', () => {
    const { issues, canonico } = compile({ 'main.dg': nodo('database') });

    expect(issues).toEqual([]);
    expect(canonico?.specification.nodeTypes[0]?.icon).toBe('database');
  });

  it('acepta un SVG del Workspace por el nombre de su archivo', () => {
    const { issues } = compile({ 'main.dg': nodo('mi-logo'), 'iconos/mi-logo.svg': '<svg></svg>' });

    expect(issues).toEqual([]);
  });

  it('un archivo .svg del Workspace no se parsea como DSL', () => {
    const { issues } = compile({ 'main.dg': nodo('database'), 'x.svg': '<svg><path d="M0 0"/></svg>' });

    expect(issues).toEqual([]);
  });

  it('clave desconocida es E_UNKNOWN_ICON con posicion y fix si hay un candidato', () => {
    const { issues, canonico } = compile({ 'main.dg': nodo('databse') });

    expect(canonico).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_ICON', severity: 'error', file: 'main.dg', line: 1 });
    expect(issues[0]?.fix?.replacement).toBe('database');
  });
});
describe('compile: drill-down', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b { servicio y }  servicio c }';

  it('compila drill collapse, collapsed, expanded y link a la Vista', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base}
        view general {
          type architecture
          include **
          drill collapse
          collapsed a
          expanded b
          link a -> detalle
        }
        view detalle { type flow }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]).toMatchObject({
      drill: 'collapse',
      collapsed: ['a'],
      expanded: ['b'],
      links: [{ node: 'a', view: 'detalle' }],
    });
  });

  it('de punta a punta: un Grupo que excede depth abre colapsado y expanded lo abre', () => {
    const fuente = (extra: string) =>
      compile({ 'main.dg': `${base} view v { type architecture include ** depth 1 ${extra} }` }).canonico;

    const cerrado = fuente('');
    const abierto = fuente('expanded a');

    expect(cerrado && resolveView(cerrado, 'v')?.nodes.find((n) => n.id === 'a')).toMatchObject({
      collapsed: true,
      childCount: 1,
      children: [],
    });
    expect(abierto && resolveView(abierto, 'v')?.nodes.map((n) => n.id)).toEqual(['a', 'a.x', 'b', 'c']);
  });

  it('una Vista sin drill-down deja collapsed, expanded y links vacios', () => {
    const { canonico } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonico?.views[0]).toMatchObject({ collapsed: [], expanded: [], links: [] });
    expect(canonico?.views[0]?.drill).toBeUndefined();
  });

  it('link a una Vista inexistente es E_UNKNOWN_VIEW_LINK, con fix si hay un candidato', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  include **\n  link a -> detale\n}\nview detalle { type flow }`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_VIEW_LINK', file: 'main.dg', line: 5 });
    expect(issues[0]?.fix?.replacement).toBe('detalle');
  });

  it('link puede apuntar a una Vista de otro archivo', () => {
    const { issues } = compile({
      'a.dg': `${base} view v { type flow include ** link a -> otra }`,
      'b.dg': 'view otra { type flow }',
    });

    expect(issues).toEqual([]);
  });

  it('collapsed/expanded sobre un Nodo que no es Grupo es E_INVALID_EXPANSION_TARGET', () => {
    const { issues } = compile({ 'main.dg': `${base}\nview v {\n  type flow\n  include **\n  collapsed c\n}` });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_INVALID_EXPANSION_TARGET', line: 5 });
  });

  it('collapsed/expanded sobre un Grupo que la Vista no muestra, o inexistente, es E_INVALID_EXPANSION_TARGET', () => {
    const fuera = compile({ 'main.dg': `${base} view v { type flow include a expanded b }` });
    const fantasma = compile({ 'main.dg': `${base} view v { type flow include ** collapsed zzz }` });

    expect(fuera.issues.map((i) => i.code)).toEqual(['E_INVALID_EXPANSION_TARGET']);
    expect(fantasma.issues.map((i) => i.code)).toEqual(['E_INVALID_EXPANSION_TARGET']);
  });

  it('link junto con expanded sobre el mismo Nodo es E_LINK_WITH_EXPANDED', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** expanded a link a -> v }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_LINK_WITH_EXPANDED']);
  });
});

describe('compile: Pasos (steps)', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x  servicio y }  servicio b  a.x -> b }';

  it('compila steps con show y hide, selectores y Aristas', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base}
        view v {
          type architecture
          include **
          steps {
            step "Entrada" { show b }
            step "Detalle" { show a.*, edge a.x -> b  hide b }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.steps).toEqual([
      { title: 'Entrada', show: [{ selector: 'b' }], hide: [] },
      { title: 'Detalle', show: [{ selector: 'a.*' }, { from: 'a.x', to: 'b' }], hide: [{ selector: 'b' }] },
    ]);
  });

  it('la Arista se nombra tambien sin la palabra `edge`', () => {
    const { canonico, issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show a.x -> b } } }`,
    });

    expect(issues).toEqual([]);
    expect(canonico?.views[0]?.steps[0]?.show).toEqual([{ from: 'a.x', to: 'b' }]);
  });

  it('sin steps la Vista queda con steps vacio', () => {
    const { canonico } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonico?.views[0]?.steps).toEqual([]);
  });

  it('un selector que no coincide con ningun Nodo es E_UNKNOWN_STEP en su posicion', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  steps {\n    step "s" { show zzz }\n  }\n}`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_UNKNOWN_STEP', severity: 'error', file: 'main.dg', line: 5, column: 21 });
  });

  it('un selector comodin sin coincidencias tambien lo es', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { hide b.* } } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_STEP']);
  });

  it('una Arista que no existe en el Modelo es E_UNKNOWN_STEP', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show edge b -> a.x } } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_STEP']);
  });

  it('un id parecido lleva fix con un unico candidato', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show a.xx } } }`,
    });

    expect(issues[0]?.code).toBe('E_UNKNOWN_STEP');
    expect(issues[0]?.fix?.replacement).toBe('a.x');
  });

  it('de punta a punta: DSL -> resolveView -> revealAt', () => {
    const { canonico } = compile({
      'main.dg': `${base} view v { type flow  include **  steps { step "1" { show b }  step "2" { show a.x } } }`,
    });
    const vista = resolveView(canonico!, 'v')!;

    expect(['a.x', 'b'].map(revealAt(vista, 1))).toEqual([0, 1]);
    expect(['a.x', 'b'].map(revealAt(vista, 2))).toEqual([1, 1]);
    expect(revealAt(vista, 2)('a.x -> b')).toBe(1);
  });
});
