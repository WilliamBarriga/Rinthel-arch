import { describe, expect, it } from 'vitest';

import { resolveView, revealAt } from 'canonical';
import { compile } from 'dsl';
import { NEUTRAL_THEME } from 'theme';

describe('compile: Nodes and specification', () => {
  it('compiles a Node kind and a Node to the Canonical form', () => {
    const result = compile({
      'main.dg': `
        specification {
          node servicio
        }
        model {
          servicio api "API" "Puerta de entrada"
        }
      `,
    });

    expect(result.issues).toEqual([]);
    expect(result.canonical).toEqual({
      specification: { nodeTypes: [{ name: 'servicio', description: '' }] },
      model: {
        edges: [],
        interactions: [],
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
      themes: expect.any(Array),
    });
  });

  it('nests Nodes without limit and qualifies the id by the hierarchy', () => {
    const { canonical, issues } = compile({
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
    const [rinthel] = canonical!.model.nodes;
    expect(rinthel?.id).toBe('rinthel');
    expect(rinthel?.children.map((n) => n.id)).toEqual(['rinthel.api']);
    expect(rinthel?.children[0]?.children.map((n) => n.id)).toEqual(['rinthel.api.auth']);
  });

  it('uses the name as title when the Node declares none', () => {
    const { canonical } = compile({
      'main.dg': 'specification { node servicio } model { servicio api }',
    });

    expect(canonical?.model.nodes[0]).toMatchObject({ id: 'api', title: 'api', description: '' });
  });

  it('reads icon, style and Palette color of a Node kind', () => {
    const { canonical } = compile({
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

    expect(canonical?.specification.nodeTypes).toEqual([
      {
        name: 'servicio',
        description: 'Proceso desplegable',
        icon: 'server',
        style: 'rounded',
        color: 'blue',
      },
    ]);
  });

  it('an undeclared Node kind produces unknown-node-type with its exact position', () => {
    const result = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  servico api', '}'].join('\n'),
    });

    expect(result.canonical).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: 'unknown-node-type',
      severity: 'error',
      file: 'main.dg',
      line: 3,
      column: 3,
    });
  });

  it('a Node kind typo with a single candidate emits a fix on the text', () => {
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

  it('with two Node kind candidates it emits no fix, only a hint', () => {
    const { issues } = compile({
      'main.dg': ['specification { node servicio node servicios }', 'model {', '  servici api', '}'].join('\n'),
    });

    expect(issues[0]?.code).toBe('unknown-node-type');
    expect(issues[0]?.fix).toBeUndefined();
    expect(issues[0]?.hint).toBe('Candidates: servicio, servicios');
  });

  it('a Node kind with no resemblance emits neither fix nor hint', () => {
    const { issues } = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  zzz api', '}'].join('\n'),
    });

    expect(issues[0]?.fix).toBeUndefined();
    expect(issues[0]?.hint).toBeUndefined();
  });

  it('a syntax error is an issue with a position, not an exception', () => {
    const result = compile({
      'main.dg': ['specification { node servicio }', 'model {', '  servicio "api"', '}'].join('\n'),
    });

    expect(result.canonical).toBeUndefined();
    expect(result.issues[0]).toMatchObject({
      code: 'syntax-error',
      severity: 'error',
      file: 'main.dg',
      // `servicio "api"` is a valid Edge prefix (`servicio "1" -> ...`):
      // the parser only complains when it reaches the `}` closing the block.
      line: 4,
      column: 1,
    });
  });

  it('joins the Workspace files: the catalog and the Nodes of all of them count', () => {
    const { canonical, issues } = compile({
      'b/modelo.dg': 'model { servicio api }',
      'a/tipos.dg': 'specification { node servicio }',
    });

    expect(issues).toEqual([]);
    expect(canonical?.specification.nodeTypes.map((t) => t.name)).toEqual(['servicio']);
    expect(canonical?.model.nodes.map((n) => n.id)).toEqual(['api']);
  });

  it('reports the issues of all files in deterministic order', () => {
    const { issues } = compile({
      'z.dg': 'model { fantasma x }',
      'a.dg': 'model {\n  fantasma y\n}',
    });

    expect(issues.map((i) => [i.file, i.line, i.code])).toEqual([
      ['a.dg', 2, 'unknown-node-type'],
      ['z.dg', 1, 'unknown-node-type'],
    ]);
  });

  it('an unclosed block at the end of the text gives syntax-error with a valid position', () => {
    const result = compile({ 'main.dg': 'specification { node servicio }\nmodel {\n  servicio api {' });

    expect(result.canonical).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: 'syntax-error', file: 'main.dg', line: 3 });
    expect(result.issues[0]?.column).toBeGreaterThanOrEqual(1);
  });
});

describe('compile: Edges', () => {
  const spec = 'specification { node servicio node base }';

  it('compiles an Edge between Nodes to the Canonical form', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api -> db
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.edges).toEqual([{ from: { node: 'api' }, to: { node: 'db' } }]);
  });

  it('reads the optional cardinality of each end', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api "1" -> "N" db
          db -> "0..1" api
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.edges).toEqual([
      { from: { node: 'api' }, to: { node: 'db' }, fromCardinality: '1', toCardinality: 'N' },
      { from: { node: 'db' }, to: { node: 'api' }, toCardinality: '0..1' },
    ]);
  });

  it('accepts the top-level words (model, node, specification) as Attribute or Node names', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          base model { attrs { model: text  node: text  specification: int } }
          servicio node
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes.map((n) => n.id)).toEqual(['model', 'node']);
    expect(canonical?.model.nodes[0]?.attributes.map((a) => a.name)).toEqual(['model', 'node', 'specification']);
  });

  it('compiles the label of an Edge, with or without cardinality', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api
          base db
          api -> db "lee y escribe"
          db "1" -> "N" api "devuelve"
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.edges).toEqual([
      { from: { node: 'api' }, to: { node: 'db' }, label: 'lee y escribe' },
      { from: { node: 'db' }, to: { node: 'api' }, fromCardinality: '1', toCardinality: 'N', label: 'devuelve' },
    ]);
  });

  it('resolves ends with an id qualified by the hierarchy', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio rinthel { servicio api }
          base db
          rinthel.api -> db
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.edges?.[0]?.from).toEqual({ node: 'rinthel.api' });
  });

  it('a Model without Edges gives an empty list', () => {
    const { canonical } = compile({ 'main.dg': `${spec} model { servicio api }` });
    expect(canonical?.model.edges).toEqual([]);
  });

  it('a missing end is dangling-edge with the position of the end', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
model {
  servicio api
  api -> nada
}`,
    });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'dangling-edge',
      severity: 'error',
      file: 'main.dg',
      line: 4,
      column: 10,
    });
    expect(issues[0]?.fix).toBeUndefined();
  });

  it('with a single close candidate it offers a fix on the end', () => {
    const { issues } = compile({
      'main.dg': `${spec}
model {
  servicio api
  base db
  api -> dbb
}`,
    });

    expect(issues[0]?.code).toBe('dangling-edge');
    expect(issues[0]?.fix).toEqual({
      file: 'main.dg',
      range: { start: { line: 5, column: 10 }, end: { line: 5, column: 13 } },
      replacement: 'db',
    });
  });

  it('with several equally close candidates there is no fix, only a hint', () => {
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

  it('reports both dangling ends', () => {
    const { issues } = compile({ 'main.dg': `${spec} model { x -> y }` });
    expect(issues.map((i) => i.code)).toEqual(['dangling-edge', 'dangling-edge']);
  });
});

describe('compile: Attributes', () => {
  const spec = 'specification { node tabla node servicio }';

  it('keeps order, type and notes of the Attributes of a Node', () => {
    const { canonical, issues } = compile({
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
    expect(canonical?.model.nodes[0]?.attributes).toEqual([
      { name: 'id', type: 'uuid', notes: 'clave primaria' },
      { name: 'email', type: 'text', notes: '' },
      { name: 'creado', type: 'timestamp', notes: 'UTC' },
    ]);
  });

  it('an Attribute is not a child Node: it is neither in children nor in the Model', () => {
    const { canonical } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios {
            attrs { id: uuid }
            tabla perfil
          }
        }`,
    });

    const [users] = canonical!.model.nodes;
    expect(users?.children.map((n) => n.id)).toEqual(['usuarios.perfil']);
    expect(users?.attributes.map((a) => a.name)).toEqual(['id']);
  });

  it('a Node without attrs has an empty list of Attributes', () => {
    const { canonical } = compile({ 'main.dg': `${spec} model { tabla t }` });
    expect(canonical?.model.nodes[0]?.attributes).toEqual([]);
  });

  it('an Edge to node#attribute compiles with the Attribute on the end', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          tabla usuarios { attrs { id: uuid } }
          tabla pedidos { attrs { usuario_id: uuid } }
          pedidos#usuario_id "N" -> "1" usuarios#id
          pedidos -> usuarios#id
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.edges).toEqual([
      {
        from: { node: 'pedidos', attribute: 'usuario_id' },
        to: { node: 'usuarios', attribute: 'id' },
        fromCardinality: 'N',
        toCardinality: '1',
      },
      { from: { node: 'pedidos' }, to: { node: 'usuarios', attribute: 'id' } },
    ]);
  });

  it('a missing Attribute is unknown-attribute with the position of the Attribute', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
model {
  tabla usuarios { attrs { id: uuid } }
  tabla pedidos
  pedidos -> usuarios#idd
}`,
    });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'unknown-attribute',
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

  it('a child Node is not valid as an Attribute, nor an Attribute as a child Node', () => {
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

    expect(issues.map((i) => i.code).sort()).toEqual(['dangling-edge', 'unknown-attribute']);
  });

  it('with a missing Node it only reports dangling-edge, not the Attribute', () => {
    const { issues } = compile({ 'main.dg': `${spec} model { tabla a  a -> nada#x }` });
    expect(issues.map((i) => i.code)).toEqual(['dangling-edge']);
  });
});

describe('compile: source', () => {
  const spec = 'specification { node servicio }';

  it('compiles several sources of a Node to a {kind, ref} list in order', () => {
    const { canonical, issues } = compile({
      'main.dg': `${spec}
        model {
          servicio api {
            source { git "src/api.ts" }
            source { url "https://ejemplo.com/api" file "docs/api.md" }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes[0]?.source).toEqual([
      { kind: 'git', ref: 'src/api.ts' },
      { kind: 'url', ref: 'https://ejemplo.com/api' },
      { kind: 'file', ref: 'docs/api.md' },
    ]);
  });

  it('a Node without source has an empty list', () => {
    const { canonical } = compile({ 'main.dg': `${spec} model { servicio api }` });
    expect(canonical?.model.nodes[0]?.source).toEqual([]);
  });

  it('stores kind and ref without interpreting them', () => {
    const { canonical } = compile({
      'main.dg': `${spec} model { servicio api { source { cualquier-cosa "  ../x:y#z  " } } }`,
    });
    expect(canonical?.model.nodes[0]?.source).toEqual([{ kind: 'cualquier-cosa', ref: '  ../x:y#z  ' }]);
  });

  it('a ref that is not a string is syntax-error with a position', () => {
    const { issues, canonical } = compile({
      'main.dg': `${spec}
        model {
          servicio api {
            source { git 42 }
          }
        }`,
    });

    expect(canonical).toBeUndefined();
    expect(issues.every((issue) => issue.code === 'syntax-error')).toBe(true);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 4, column: 26 });
  });
});

describe('compile: multi-file Workspace', () => {
  it('merges specification, Nodes and Edges of several files into one Model', () => {
    const { canonical, issues } = compile({
      'tipos.dg': 'specification { node servicio }',
      'nodos.dg': 'model { servicio api  servicio db }',
      'aristas.dg': 'model { api -> db }',
    });

    expect(issues).toEqual([]);
    expect(canonical?.specification.nodeTypes.map((t) => t.name)).toEqual(['servicio']);
    expect(canonical?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(canonical?.model.edges).toEqual([{ from: { node: 'api' }, to: { node: 'db' } }]);
  });

  it('extend adds children, Attributes and source to a Node of another file', () => {
    const { canonical, issues } = compile({
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
    const api = canonical?.model.nodes[0];
    expect(api?.children.map((n) => n.id)).toEqual(['api.auth', 'api.cache']);
    expect(api?.attributes).toEqual([{ name: 'puerto', type: 'int', notes: '' }]);
    expect(api?.source).toEqual([{ kind: 'git', ref: 'src/api.ts' }]);
    expect(api?.children[0]?.children.map((n) => n.id)).toEqual(['api.auth.tokens']);
  });

  it('an extend can be in a file read before the Node', () => {
    const { canonical, issues } = compile({
      'a-extiende.dg': 'model { extend api { servicio cache } }',
      'z-define.dg': 'specification { node servicio }  model { servicio api }',
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes[0]?.children.map((n) => n.id)).toEqual(['api.cache']);
  });

  it('an extend can point to a Node created by another extend, in any file order', () => {
    const base = { 'a.dg': 'model { extend api.cache { servicio x } }', 'z.dg': 'specification { node servicio }  model { servicio api  extend api { servicio cache } }' };
    const { canonical, issues } = compile(base);

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes[0]?.children[0]?.children.map((n) => n.id)).toEqual(['api.cache.x']);
  });

  it('a duplicated Node without extend is duplicate-node with related to the original', () => {
    const { issues, canonical } = compile({
      'a.dg': 'specification { node servicio }\nmodel {\n  servicio api\n}',
      'b.dg': 'model {\n  servicio db\n  servicio api\n}',
    });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'duplicate-node',
      severity: 'error',
      file: 'b.dg',
      line: 3,
      column: 12,
      related: [{ file: 'a.dg', line: 3, column: 12 }],
    });
  });

  it('detects duplicates within the same file and among children', () => {
    const { issues } = compile({
      'a.dg': `specification { node servicio }
        model {
          servicio api { servicio x  servicio x }
          servicio api
        }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['duplicate-node', 'duplicate-node']);
  });

  it('an extend whose Node does not exist is unknown-extend-target', () => {
    const { issues } = compile({
      'a.dg': 'specification { node servicio }\nmodel {\n  extend nada { servicio x }\n}',
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-extend-target', file: 'a.dg', line: 3, column: 10 });
  });

  it('the result does not depend on the order the files are passed in', () => {
    const files: [string, string][] = [
      ['a.dg', 'specification { node servicio }  model { servicio api }'],
      ['b.dg', 'model { extend api { servicio cache } servicio db }'],
      ['c.dg', 'model { extend api { servicio cola } api -> db }'],
    ];
    const results = [files, [...files].reverse(), [files[1], files[2], files[0]]].map(
      (order) => {
        const { locate: _locate, ...result } = compile(Object.fromEntries(order as [string, string][]));
        return result;
      },
    );

    expect(results[0]?.issues).toEqual([]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('the duplicate resolves the same regardless of the file order', () => {
    const base = { 'x.dg': 'model { servicio api }', 'y.dg': 'specification { node servicio }  model { servicio api }' };
    const inverted = { 'y.dg': base['y.dg'], 'x.dg': base['x.dg'] };

    expect(compile(inverted)).toEqual(compile(base));
  });
});

describe('compile: Views', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b }';

  it('compiles view with type, include, exclude and depth', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        view general {
          type architecture
          include a.*, b.**, c
          exclude b
          depth 2
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.views).toEqual([
      { id: 'general', type: 'architecture', include: ['a.*', 'b.**', 'c'], exclude: ['b'], depth: 2, order: [], overrides: [], collapsed: [], expanded: [], links: [], steps: [] },
    ]);
  });

  it('a flow View with only type; the rest stays empty', () => {
    const { canonical } = compile({ 'main.dg': `${base} view f { type flow }` });

    expect(canonical?.views).toEqual([{ id: 'f', type: 'flow', include: [], exclude: [], order: [], overrides: [], collapsed: [], expanded: [], links: [], steps: [] }]);
  });

  it('accepts `*` and `**` as selectors and several includes', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base} view t { type flow  include *  include ** }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.views[0]?.include).toEqual(['*', '**']);
  });

  it('a missing type is unknown-view-type with a position', () => {
    const { issues, canonical } = compile({
      'main.dg': `${base}\nview sin_tipo {\n  include a\n}`,
    });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-view-type', file: 'main.dg', line: 2, column: 6 });
  });

  it('an unknown type is unknown-view-type at the position of the value', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type secuencia\n}`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-view-type', line: 3, column: 8 });
  });

  it('depth 0 is syntactically valid and does not make compile throw', () => {
    const { canonical, issues } = compile({ 'main.dg': `${base} view v { type flow  include **  depth 0 }` });

    expect(issues).toEqual([]);
    expect(canonical?.views[0]?.depth).toBe(0);
  });

  it('merges Views of several files', () => {
    const { canonical, issues } = compile({
      'a.dg': base,
      'b.dg': 'view uno { type flow }',
      'c.dg': 'view dos { type architecture }',
    });

    expect(issues).toEqual([]);
    expect(canonical?.views.map((v) => v.id)).toEqual(['uno', 'dos']);
  });
});

describe('compile: per-Node presentation overrides in the View', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b }';

  it('compiles label, pin, order and color to the View without touching the Model', () => {
    const without = compile({ 'main.dg': `${base} view v { type architecture include ** }` });
    const { canonical, issues } = compile({
      'main.dg': `${base}
        view v {
          type architecture
          include **
          node a.x { label "Equis" pin 120,40 order 2 color blue }
          node b { color red }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.views[0]?.overrides).toEqual([
      { node: 'a.x', label: 'Equis', pin: { x: 120, y: 40 }, order: 2, color: 'blue' },
      { node: 'b', color: 'red' },
    ]);
    expect(canonical?.model).toEqual(without.canonical?.model);
  });

  it('reports the position of each override with pin, so other commands can locate their warnings', () => {
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

  it('a View without overrides leaves them empty', () => {
    const { canonical } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonical?.views[0]?.overrides).toEqual([]);
  });

  it('an override on a Node outside the View is override-outside-view with a position', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  include a\n  node b { color red }\n}`,
    });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'override-outside-view',
      severity: 'error',
      file: 'main.dg',
      line: 5,
      column: 8,
    });
  });

  it('an override on a missing Node is also override-outside-view', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** node fantasma { label "x" } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['override-outside-view']);
  });

  it('color only accepts Palette names: a hex is unknown-palette-color', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** node a { color "#ff0000" } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['unknown-palette-color']);
  });

  it('pin accepts negative coordinates', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base} view v { type flow include ** node a { pin -10,-5 } }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.views[0]?.overrides[0]?.pin).toEqual({ x: -10, y: -5 });
  });
});

describe('compile: Theme', () => {
  const base = 'specification { node servicio { color blue } }  model { servicio a }';
  const light = 'theme claro { palette { blue "#0000ff"  danger "#ff0000" } fonts { body "Inter, sans-serif" } tokens { surface "#ffffff" } }';

  it('a Workspace without theme uses the neutral Theme', () => {
    const { canonical, issues } = compile({ 'main.dg': base });

    expect(issues).toEqual([]);
    expect(canonical?.themes.map((t) => t.name)).toEqual(['neutral', 'neutral-dark', 'high-contrast']);
  });

  it('compiles palette, fonts and tokens to a flat object', () => {
    const { canonical, issues } = compile({ 'main.dg': `${base} ${light}` });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 'claro')).toEqual({
      name: 'claro',
      palette: { blue: '#0000ff', danger: '#ff0000' },
      fonts: { ...NEUTRAL_THEME.fonts, body: 'Inter, sans-serif' },
      tokens: { ...NEUTRAL_THEME.tokens, surface: '#ffffff' },
      nodo: NEUTRAL_THEME.nodo,
      grupo: NEUTRAL_THEME.grupo,
      arista: NEUTRAL_THEME.arista,
      pagina: NEUTRAL_THEME.pagina,
    });
  });

  it('extends inherits from a single parent and the child wins; the result is already resolved', () => {
    const { canonical, issues } = compile({
      'a.dg': `${base} ${light}`,
      'b.dg': 'theme oscuro extends claro { palette { blue "#00aaff" } tokens { surface "#111111" } }',
    });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 'oscuro')).toEqual({
      name: 'oscuro',
      palette: { blue: '#00aaff', danger: '#ff0000' },
      fonts: { ...NEUTRAL_THEME.fonts, body: 'Inter, sans-serif' },
      tokens: { ...NEUTRAL_THEME.tokens, surface: '#111111' },
      nodo: NEUTRAL_THEME.nodo,
      grupo: NEUTRAL_THEME.grupo,
      arista: NEUTRAL_THEME.arista,
      pagina: NEUTRAL_THEME.pagina,
    });
  });

  it('a Theme can extend the neutral one', () => {
    const { canonical, issues } = compile({ 'main.dg': `${base} theme t extends neutral { palette { teal "#008080" } }` });

    expect(issues).toEqual([]);
    const neutral = canonical?.themes.find((t) => t.name === 'neutral');
    expect(canonical?.themes.find((t) => t.name === 't')).toEqual({ ...neutral, name: 't', palette: { ...neutral?.palette, teal: '#008080' } });
  });

  it('compiles the node block to a Layer stack and to the Slots, with the catalog defaults', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme ejemplo {
          palette { blue "#2563eb"  gray "#6b7280" }
          node {
            layer forma rect
            layer relleno solid { color blue }
            layer borde border { color gray  width 2 }
            slots { attrs title }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 'ejemplo')?.['nodo']).toEqual({
      capas: [
        { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
        { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'blue' } } },
        { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'gray', width: 2 } } },
      ],
      slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'attrs' }, { slot: 'title' }] },
      textos: {},
      tipos: {},
      estados: {},
    });
  });

  it('edge { state <name> { ... } } compiles a paint-only patch of the stroke stack per state', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme lines {
          palette { blue "#2563eb"  gray "#6b7280" }
          edge {
            layer main line { color gray }
            state planned { layer main { color blue  style dotted } }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect((canonical?.themes.find((t) => t.name === 'lines')?.['arista'] as { estados?: unknown }).estados).toEqual({
      planned: [{ nombre: 'main', props: { color: 'blue', style: 'dotted' } }],
    });
  });

  it('a state of edge rejects slots and an unknown state', () => {
    const { issues } = compile({
      'main.dg': `${base}
        theme lines {
          palette { gray "#6b7280" }
          edge {
            layer main line { color gray }
            state planed { layer main { width 2 } }
            state hover { slots { title } }
          }
        }`,
    });

    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining([expect.stringContaining("'slots' is not valid in a state of 'edge'")]));
    expect(issues.some((i) => i.fix?.replacement === 'planned' || i.hint?.includes('planned') === true)).toBe(true);
  });

  it('compiles the edge block: stroke stack with glow, markers and a label with a box model', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme metro {
          palette { blue "#2563eb"  gray "#6b7280" }
          edge {
            layer glow line { color ORIGIN/0.3  width 8 }
            layer principal line { color ORIGIN  width 2  style dashed  corner chamfer }
            start dot { size 6 }
            end via
            label { pad 6  fill blue }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 'metro')?.['arista']).toEqual({
      capas: [
        { nombre: 'glow', primitiva: { tipo: 'line', props: { color: 'ORIGIN/0.3', width: 8, style: 'solid', corner: 'sharp', cut: 6, radius: 8 } } },
        { nombre: 'principal', primitiva: { tipo: 'line', props: { color: 'ORIGIN', width: 2, style: 'dashed', corner: 'chamfer', cut: 6, radius: 8 } } },
      ],
      origen: { tipo: 'dot', props: { size: 6 } },
      fin: { tipo: 'via', props: { size: 8 } },
      etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 6, radius: 0, fill: 'blue' } },
    });
  });

  it('the edge block rejects Node Primitives, invalid values and unknown markers with a suggestion', () => {
    const { issues } = compile({
      'main.dg': `${base}
        theme malo {
          palette { blue "#2563eb"  gray "#6b7280" }
          edge {
            layer a solid { color blue }
            layer b line { color blue  style rayado }
            end flecha
          }
        }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['theme-unknown-primitive', 'theme-invalid-value', 'theme-unknown-primitive']);
    expect(issues[2]?.message).toContain('arrow');
  });

  it('a Slot carries its text style in the slots block', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme t { node { slots { title { weight 700  transform uppercase }  attrs } } }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 't')?.['nodo']).toMatchObject({
      slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'attrs' }] },
      textos: { title: { tipo: 'text', props: { weight: 700, style: 'normal', transform: 'uppercase' } } },
    });
  });

  it('slots accepts nested rows and columns with gap, pad, align and tokens, and the icon style', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme t {
          tokens { gap 6 }
          palette { ink "#111111" }
          node {
            slots column pad 10 {
              row gap $gap {
                icon { variant box  side 24  radius 6  fill ink/0.1  border ink }
                title { align start  weight 700 }
              }
              attrs
            }
          }
        }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.themes.find((t) => t.name === 't')?.['nodo']).toMatchObject({
      slots: {
        direccion: 'column',
        gap: 0,
        pad: 10,
        hijos: [
          { direccion: 'row', gap: 6, pad: 0, hijos: [{ slot: 'icon' }, { slot: 'title', align: 'start' }] },
          { slot: 'attrs' },
        ],
      },
      textos: {
        icon: { tipo: 'icon', props: { variant: 'box', side: 24, radius: 6, fill: 'ink/0.1', border: 'ink' } },
        title: { tipo: 'text', props: { weight: 700 } },
      },
    });
  });

  it('slots keys are validated with suggestion and position; a state patch does not change the layout', () => {
    const { issues } = compile({
      'main.dg': `${base}
        theme t {
          node {
            slots row gapp 4 {
              icn
              title { align centro }
            }
            state hover { slots column { title } }
          }
        }`,
    });

    expect(issues.map((i) => [i.code, i.line])).toEqual([
      ['theme-unknown-property', 4],
      ['theme-unknown-slot', 5],
      ['theme-invalid-value', 6],
      ['theme-state-touches-metrics', 8],
    ]);
    expect(issues[0]!.hint).toContain("'gap'");
    expect(issues[1]!.hint).toContain("'icon'");
    expect(issues[2]!.hint).toContain("'center'");
  });

  it('a state patch changing the text style of the Group header (tracking, chip, size) is an error, like the layout', () => {
    const { issues } = compile({
      'main.dg': `${base}
        theme t {
          group {
            slots row { title { size 0.9 } counter }
            state hover { slots { title { tracking 0.2 size 1.4 } } }
            state collapsed { slots column { title { tracking 0.1 } } }
          }
        }`,
    });

    expect(issues.map((i) => [i.code, i.line])).toEqual([['theme-state-touches-metrics', 5]]);
    expect(issues[0]!.message).toContain('Slots');
  });

  it('compiles the effect Families with their defaults, and `seed N` in tokens', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}
        theme efectos {
          palette { blue "#2563eb"  gray "#6b7280" }
          tokens { seed 7 }
          node {
            layer sombra shadow { color gray  blur 0  x 4  y 4 }
            layer aura glow { color blue }
            layer cristal glass
            layer trazo sketch { roughness 3 }
            layer ladeo tilt { degrees 2 }
          }
        }`,
    });

    const theme = canonical?.themes.find((t) => t.name === 'efectos');
    expect(issues).toEqual([]);
    expect((theme?.['tokens'] as Record<string, string>)['seed']).toBe('7');
    expect((theme?.['nodo'] as { capas: Array<{ primitiva: { tipo: string } }> }).capas.map((c) => c.primitiva.tipo)).toEqual(['shadow', 'glow', 'glass', 'sketch', 'tilt']);
  });

  it('a rotation of more than 3 degrees is an error, it is not clamped', () => {
    const { issues } = compile({ 'main.dg': `${base} theme excedido { node { layer ladeo tilt { degrees 4 } } }` });

    expect(issues.map((i) => i.code)).toEqual(['theme-invalid-value']);
  });

  it('the nodeStyles and edgeStyles blocks no longer exist in the DSL', () => {
    const { issues } = compile({ 'main.dg': `${base} theme viejo { nodeStyles { servicio { fill red } } }` });

    expect(issues.map((i) => i.code)).toContain('syntax-error');
  });

  it('layer and slots are still valid identifiers in the Model', () => {
    const { canonical, issues } = compile({ 'main.dg': 'specification { node layer }  model { layer slots }' });

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes.map((n) => n.id)).toEqual(['slots']);
  });

  it('a duplicated theme is duplicate-theme with related to the first declaration', () => {
    const { issues } = compile({ 'main.dg': `${base}\n${light}\ntheme claro { }` });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'duplicate-theme', file: 'main.dg', line: 3 });
    expect(issues[0]?.related?.[0]).toMatchObject({ file: 'main.dg', line: 2 });
  });

  it('declaring `neutral` duplicates the default Theme', () => {
    const { issues } = compile({ 'main.dg': `${base} theme neutral { }` });

    expect(issues.map((i) => i.code)).toEqual(['duplicate-theme']);
  });

  it('an extends cycle is extends-cycle', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base}\ntheme a extends b { }\ntheme b extends a { }`,
    });

    expect(canonical).toBeUndefined();
    expect(issues.map((i) => i.code)).toEqual(['extends-cycle', 'extends-cycle']);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 2 });
  });

  it('extends of a missing theme is unknown-theme', () => {
    const { issues } = compile({ 'main.dg': `${base} theme a extends fantasma { }` });

    expect(issues.map((i) => i.code)).toEqual(['unknown-theme']);
  });

  it('a View can choose its theme; a missing one is unknown-theme', () => {
    const valid = compile({ 'main.dg': `${base} ${light} view v { type flow theme claro }` });
    const invalid = compile({ 'main.dg': `${base} view v { type flow theme claroo }` });

    expect(valid.issues).toEqual([]);
    expect(valid.canonical?.views[0]?.theme).toBe('claro');
    expect(invalid.issues.map((i) => i.code)).toEqual(['unknown-theme']);
  });

  it('a View with a Theme that exists but does not resolve does not say "not declared": only the real Theme error remains', () => {
    const { issues } = compile({ 'main.dg': `${base} theme a extends fantasma { }  view v { type flow theme a }` });

    expect(issues.map((i) => [i.code, i.line])).toEqual([['unknown-theme', 1]]);
    expect(issues[0]?.message).toContain("'fantasma'");
  });

  it('an unknown Node kind color is unknown-palette-color with a fix if there is a candidate', () => {
    const { issues } = compile({ 'main.dg': 'specification { node servicio { color blu } }  model { servicio a }' });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-palette-color', file: 'main.dg' });
    expect(issues[0]?.fix?.replacement).toBe('blue');
  });

  it('a hex outside the Theme is never a valid color', () => {
    const { issues } = compile({ 'main.dg': 'specification { node servicio { color "#ff0000" } }  model { servicio a }' });

    expect(issues.map((i) => i.code)).toEqual(['unknown-palette-color']);
  });

  it('an override color is validated against the Palette of the View theme', () => {
    const view = (theme: string) =>
      `${base} ${light} view v { type flow include ** theme ${theme} node a { color danger } }`;

    expect(compile({ 'main.dg': view('claro') }).issues).toEqual([]);
    expect(compile({ 'main.dg': view('neutral') }).issues.map((i) => i.code)).toEqual(['unknown-palette-color']);
  });
});
describe('compile: icons', () => {
  const node = (iconName: string) => `specification { node servicio { icon ${iconName} } }  model { servicio a }`;

  it('accepts a key of the generic icons', () => {
    const { issues, canonical } = compile({ 'main.dg': node('database') });

    expect(issues).toEqual([]);
    expect(canonical?.specification.nodeTypes[0]?.icon).toBe('database');
  });

  it('accepts a Workspace SVG by its file name', () => {
    const { issues } = compile({ 'main.dg': node('mi-logo'), 'iconos/mi-logo.svg': '<svg></svg>' });

    expect(issues).toEqual([]);
  });

  it('a Workspace .svg file is not parsed as DSL', () => {
    const { issues } = compile({ 'main.dg': node('database'), 'x.svg': '<svg><path d="M0 0"/></svg>' });

    expect(issues).toEqual([]);
  });

  it('an unknown key is unknown-icon with position and a fix if there is a candidate', () => {
    const { issues, canonical } = compile({ 'main.dg': node('databse') });

    expect(canonical).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-icon', severity: 'error', file: 'main.dg', line: 1 });
    expect(issues[0]?.fix?.replacement).toBe('database');
  });
});
describe('compile: drill-down', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x }  servicio b { servicio y }  servicio c }';

  it('compiles drill collapse, collapsed, expanded and link to the View', () => {
    const { canonical, issues } = compile({
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
    expect(canonical?.views[0]).toMatchObject({
      drill: 'collapse',
      collapsed: ['a'],
      expanded: ['b'],
      links: [{ node: 'a', view: 'detalle' }],
    });
  });

  it('end to end: a Group beyond depth opens collapsed and expanded opens it', () => {
    const source = (extra: string) =>
      compile({ 'main.dg': `${base} view v { type architecture include ** depth 1 ${extra} }` }).canonical;

    const closed = source('');
    const open = source('expanded a');

    expect(closed && resolveView(closed, 'v')?.nodes.find((n) => n.id === 'a')).toMatchObject({
      collapsed: true,
      childCount: 1,
      children: [],
    });
    expect(open && resolveView(open, 'v')?.nodes.map((n) => n.id)).toEqual(['a', 'a.x', 'b', 'c']);
  });

  it('a View without drill-down leaves collapsed, expanded and links empty', () => {
    const { canonical } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonical?.views[0]).toMatchObject({ collapsed: [], expanded: [], links: [] });
    expect(canonical?.views[0]?.drill).toBeUndefined();
  });

  it('a link to a missing View is unknown-view-link, with a fix if there is a candidate', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  include **\n  link a -> detale\n}\nview detalle { type flow }`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-view-link', file: 'main.dg', line: 5 });
    expect(issues[0]?.fix?.replacement).toBe('detalle');
  });

  it('link can point to a View of another file', () => {
    const { issues } = compile({
      'a.dg': `${base} view v { type flow include ** link a -> otra }`,
      'b.dg': 'view otra { type flow }',
    });

    expect(issues).toEqual([]);
  });

  it('collapsed/expanded on a Node that is not a Group is invalid-expansion-target', () => {
    const { issues } = compile({ 'main.dg': `${base}\nview v {\n  type flow\n  include **\n  collapsed c\n}` });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'invalid-expansion-target', line: 5 });
  });

  it('collapsed/expanded on a Group the View does not show, or missing, is invalid-expansion-target', () => {
    const outside = compile({ 'main.dg': `${base} view v { type flow include a expanded b }` });
    const ghost = compile({ 'main.dg': `${base} view v { type flow include ** collapsed zzz }` });

    expect(outside.issues.map((i) => i.code)).toEqual(['invalid-expansion-target']);
    expect(ghost.issues.map((i) => i.code)).toEqual(['invalid-expansion-target']);
  });

  it('link together with expanded on the same Node is link-with-expanded', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow include ** expanded a link a -> v }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['link-with-expanded']);
  });
});

describe('compile: Steps', () => {
  const base = 'specification { node servicio }  model { servicio a { servicio x  servicio y }  servicio b  a.x -> b }';

  it('compiles steps with show and hide, selectors and Edges', () => {
    const { canonical, issues } = compile({
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
    expect(canonical?.views[0]?.steps).toEqual([
      { title: 'Entrada', show: [{ selector: 'b' }], hide: [] },
      { title: 'Detalle', show: [{ selector: 'a.*' }, { from: 'a.x', to: 'b' }], hide: [{ selector: 'b' }] },
    ]);
  });

  it('the Edge can also be named without the word `edge`', () => {
    const { canonical, issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show a.x -> b } } }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.views[0]?.steps[0]?.show).toEqual([{ from: 'a.x', to: 'b' }]);
  });

  it('without steps the View has empty steps', () => {
    const { canonical } = compile({ 'main.dg': `${base} view v { type flow }` });

    expect(canonical?.views[0]?.steps).toEqual([]);
  });

  it('a selector matching no Node is unknown-step at its position', () => {
    const { issues } = compile({
      'main.dg': `${base}\nview v {\n  type flow\n  steps {\n    step "s" { show zzz }\n  }\n}`,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unknown-step', severity: 'error', file: 'main.dg', line: 5, column: 21 });
  });

  it('a wildcard selector without matches is too', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { hide b.* } } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['unknown-step']);
  });

  it('an Edge that does not exist in the Model is unknown-step', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show edge b -> a.x } } }`,
    });

    expect(issues.map((i) => i.code)).toEqual(['unknown-step']);
  });

  it('a similar id carries a fix with a single candidate', () => {
    const { issues } = compile({
      'main.dg': `${base} view v { type flow  steps { step "s" { show a.xx } } }`,
    });

    expect(issues[0]?.code).toBe('unknown-step');
    expect(issues[0]?.fix?.replacement).toBe('a.x');
  });

  it('end to end: DSL -> resolveView -> revealAt', () => {
    const { canonical } = compile({
      'main.dg': `${base} view v { type flow  include **  steps { step "1" { show b }  step "2" { show a.x } } }`,
    });
    const view = resolveView(canonical!, 'v')!;

    expect(['a.x', 'b'].map(revealAt(view, 1))).toEqual([0, 1]);
    expect(['a.x', 'b'].map(revealAt(view, 2))).toEqual([1, 1]);
    expect(revealAt(view, 2)('a.x -> b')).toBe(1);
  });
});

describe('compile: Themes of the rinthel-arch example', () => {
  it('they extend the built-in ones dark and light with Node kind patches, without issues', async () => {
    // `theme-views.dg` uses the 14 Themes of `themes/`, with deliberate contrast warnings: tests/docs-examples.test.ts covers it.
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../../../examples/rinthel-arch/', import.meta.url);
    const fonts = Object.fromEntries(
      readdirSync(dir).filter((f) => f.endsWith('.dg') && f !== 'theme-views.dg').map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]),
    );
    const { canonical, issues } = compile(fonts);

    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    const themeList = canonical?.themes ?? [];
    expect(issues).toEqual([]);
    const theme = (name: string) => themeList.find((t) => t.name === name) as unknown as { tokens: object; nodo: { tipos: Record<string, Array<{ nombre: string }>> } };
    expect(theme('diagrams').tokens).toMatchObject({ background: '#09090b' });
    expect(theme('diagrams-light').tokens).toMatchObject({ background: '#f8fafc' });
    for (const name of ['diagrams', 'diagrams-light']) {
      expect(theme(name).nodo.tipos['package']?.map((op) => op.nombre)).toEqual(['accent']);
      expect(theme(name).nodo.tipos['external']?.map((op) => op.nombre)).toEqual(['fill', 'border']);
    }
  });
});

describe('compile: Interactions and sequence Views', () => {
  it('compiles an Interaction with kinds, aliases, labels and a self message, and a View with interaction and order', () => {
    const { issues, canonical } = compile({
      'main.dg': `specification { node servicio }
        model {
          servicio a
          servicio b
          interaction flujo "Flujo" "Descripcion" {
            primero: a -> b "ida" "detalle"
            async b -> b
            reply b -> a "vuelta"
          }
        }
        view v { type sequence  interaction flujo  order b, a }`,
    });

    expect(issues).toEqual([]);
    expect(canonical?.model.interactions).toEqual([
      {
        id: 'flujo',
        title: 'Flujo',
        description: 'Descripcion',
        items: [
          { type: 'message', id: 'primero', kind: 'sync', from: 'a', to: 'b', label: 'ida', description: 'detalle' },
          { type: 'message', kind: 'async', from: 'b', to: 'b' },
          { type: 'message', kind: 'reply', from: 'b', to: 'a', label: 'vuelta' },
        ],
      },
    ]);
    expect(canonical?.views[0]).toMatchObject({ type: 'sequence', interaction: 'flujo', order: ['b', 'a'] });
  });
});
