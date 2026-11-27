import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { CollapseState, GraphView } from 'canonical';

const resolveGraph = (...args: Parameters<typeof resolveView>) => resolveView(...args) as GraphView | undefined;

const node = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop(),
  description: '',
  children,
});

/** a { a1 { a1x } a2 }, b { b1 }, c */
function source(view: Record<string, unknown>, extraEdges: unknown[] = []) {
  return canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [
        node('a', [node('a.a1', [node('a.a1.a1x')]), node('a.a2')]),
        node('b', [node('b.b1')]),
        node('c'),
      ],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b.b1' } },
        { from: { node: 'a.a2' }, to: { node: 'c' } },
        { from: { node: 'a.a2' }, to: { node: 'b.b1' } },
        ...extraEdges,
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: [], exclude: [], ...view }],
  });
}

function visibleIds(view: Record<string, unknown>, state?: CollapseState): string[] {
  return (resolveView(source(view), 'v', state)?.nodes ?? []).map((n) => n.id);
}

describe('resolveView', () => {
  it('an id without a suffix selects only that Node', () => {
    expect(visibleIds({ include: ['a', 'c'] })).toEqual(['a', 'c']);
  });

  it('`x.*` selects the direct children and `x.**` all descendants', () => {
    expect(visibleIds({ include: ['a.*'] })).toEqual(['a.a1', 'a.a2']);
    expect(visibleIds({ include: ['a.**'] })).toEqual(['a.a1', 'a.a1.a1x', 'a.a2']);
  });

  it('bare `*` and `**` select the roots and the whole Model', () => {
    expect(visibleIds({ include: ['*'] })).toEqual(['a', 'b', 'c']);
    expect(visibleIds({ include: ['**'] })).toEqual(['a', 'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('exclude removes what was selected, with the same selectors', () => {
    expect(visibleIds({ include: ['**'], exclude: ['c', 'a.**'] })).toEqual(['a', 'b', 'b.b1']);
  });

  it('depth limits the nesting level (roots are level 1)', () => {
    expect(visibleIds({ include: ['**'], depth: 1 })).toEqual(['a', 'b', 'c']);
    expect(visibleIds({ include: ['**'], depth: 2 })).toEqual(['a', 'a.a1', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('exclude does not carry over to descendants: a visible child under an excluded Node stays visible', () => {
    expect(visibleIds({ include: ['**'], exclude: ['a'] })).toEqual([
      'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'b.b1', 'c',
    ]);
  });

  it('depth 0 shows nothing', () => {
    expect(visibleIds({ include: ['**'], depth: 0 })).toEqual([]);
  });

  it('a View without include shows nothing', () => {
    expect(visibleIds({})).toEqual([]);
  });

  it('the visible Edges are those with both ends visible', () => {
    const view = resolveGraph(source({ include: ['a.*', 'c'] }), 'v');

    expect(view?.edges).toEqual([{ from: { node: 'a.a2' }, to: { node: 'c' }, count: 1 }]);
  });

  it('visible Nodes only list visible Nodes as children', () => {
    const view = resolveView(source({ include: ['a', 'a.a1.**'] }), 'v');
    const a = view?.nodes.find((n) => n.id === 'a');

    expect(a?.children).toEqual([]);
    expect(view?.nodes.map((n) => n.id)).toEqual(['a', 'a.a1.a1x']);
  });

  it('a missing View returns undefined and the Canonical form is not modified', () => {
    const f = source({ include: ['**'] });
    const before = JSON.stringify(f);

    expect(resolveView(f, 'nada')).toBeUndefined();
    resolveView(f, 'v');
    expect(JSON.stringify(f)).toBe(before);
  });
});

describe('resolveView: Group collapse', () => {
  const nodeOf = (id: string, state?: CollapseState, view: Record<string, unknown> = {}) =>
    resolveView(source({ include: ['**'], ...view }), 'v', state)?.nodes.find((n) => n.id === id);

  it('a Group beyond depth opens collapsed, with its child count', () => {
    const a = nodeOf('a', undefined, { depth: 1 });

    expect(a).toMatchObject({ collapsed: true, childCount: 2, children: [] });
    expect(nodeOf('c', undefined, { depth: 1 })).toMatchObject({ collapsed: false, childCount: 0 });
  });

  it('a Group within depth is shown expanded', () => {
    const view = resolveView(source({ include: ['**'], depth: 2 }), 'v');

    expect(view?.nodes.find((n) => n.id === 'a')).toMatchObject({ collapsed: false });
    expect(view?.nodes.find((n) => n.id === 'a.a1')).toMatchObject({ collapsed: true, childCount: 1 });
    expect(view?.nodes.map((n) => n.id)).toEqual(['a', 'a.a1', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('`expanded` overrides the depth collapse and `collapsed` overrides the open state', () => {
    expect(visibleIds({ include: ['**'], depth: 1, expanded: ['a'] })).toEqual(['a', 'a.a1', 'a.a2', 'b', 'c']);
    expect(visibleIds({ include: ['**'], collapsed: ['a'] })).toEqual(['a', 'b', 'b.b1', 'c']);
  });

  it('the caller collapse state wins over the View', () => {
    const view = { include: ['**'], depth: 1, collapsed: ['b'], expanded: ['a'] };

    expect(visibleIds(view, { collapsed: ['a'], expanded: ['b'] })).toEqual(['a', 'b', 'b.b1', 'c']);
  });

  it('a Group with a link does not expand even with expanded state', () => {
    const view = { include: ['**'], links: [{ node: 'b', view: 'detalle' }] };

    expect(visibleIds(view, { expanded: ['b'] })).toEqual(['a', 'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'c']);
    expect(nodeOf('b', undefined, view)).toMatchObject({ collapsed: true, link: 'detalle' });
  });

  it('child Edges are lifted to the collapsed Group and merged per pair of ends', () => {
    const view = resolveGraph(source({ include: ['**'], depth: 1 }), 'v');

    expect(view?.edges).toEqual([
      { from: { node: 'a' }, to: { node: 'b' }, count: 2 },
      { from: { node: 'a' }, to: { node: 'c' }, count: 1 },
    ]);
  });

  it('an internal Edge of a collapsed Group disappears and reappears when the Group is expanded', () => {
    const internal = [{ from: { node: 'a.a1' }, to: { node: 'a.a2' } }];
    const closed = resolveGraph(source({ include: ['**'], depth: 1 }, internal), 'v');
    const expanded = resolveGraph(source({ include: ['**'], depth: 1, expanded: ['a'] }, internal), 'v');

    expect(closed?.edges.some((e) => e.from.node === 'a' && e.to.node === 'a')).toBe(false);
    expect(expanded?.edges).toContainEqual({ from: { node: 'a.a1' }, to: { node: 'a.a2' }, count: 1 });
  });

  it('lifting drops the Attribute of the end; ends that are not lifted keep it', () => {
    const f = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [
          { ...node('t', [{ ...node('t.x'), attributes: [{ name: 'id', type: 'int' }] }]) },
          { ...node('u'), attributes: [{ name: 'tid', type: 'int' }] },
        ],
        edges: [{ from: { node: 'u', attribute: 'tid' }, to: { node: 't.x', attribute: 'id' }, toCardinality: '1' }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], depth: 1 }],
    });

    expect(resolveGraph(f, 'v')?.edges).toEqual([
      { from: { node: 'u', attribute: 'tid' }, to: { node: 't' }, toCardinality: '1', count: 1 },
    ]);
  });

  it('merging lifted Edges that repeat a pair drops the label; a single one keeps it', () => {
    const f = (edges: unknown[]) =>
      canonicalFormSchema.parse({
        specification: { nodeTypes: [{ name: 'servicio' }] },
        model: { nodes: [node('t', [node('t.x'), node('t.y')]), node('u')], edges },
        views: [{ id: 'v', type: 'architecture', include: ['**'], depth: 1 }],
      });

    expect(resolveGraph(f([{ from: { node: 'u' }, to: { node: 't.x' }, label: 'lee' }]), 'v')?.edges).toEqual([
      { from: { node: 'u' }, to: { node: 't' }, label: 'lee', count: 1 },
    ]);
    expect(
      resolveGraph(f([{ from: { node: 'u' }, to: { node: 't.x' }, label: 'lee' }, { from: { node: 'u' }, to: { node: 't.y' }, label: 'escribe' }]), 'v')?.edges,
    ).toEqual([{ from: { node: 'u' }, to: { node: 't' }, count: 2 }]);
  });

  it('the collapse state does not modify the Canonical form', () => {
    const f = source({ include: ['**'], depth: 1 });
    const before = JSON.stringify(f);

    resolveView(f, 'v', { expanded: ['a'] });
    expect(JSON.stringify(f)).toBe(before);
  });
});

describe('Views in the schema', () => {
  it('a View with an unknown type is rejected by the schema', () => {
    expect(() => source({ type: 'secuencia' })).toThrow();
  });
});

describe('resolveView: label and color of each Node', () => {
  const withTypes = (view: Record<string, unknown>) =>
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue', icon: 'server' }, { name: 'base' }] },
      model: {
        nodes: [
          { id: 'a', type: 'servicio', title: 'Servicio A', description: '', children: [] },
          { id: 'b', type: 'base', title: 'Base B', description: '', children: [] },
        ],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...view }],
    });

  it('the label is the title and the color is that of the Node kind, if it has one', () => {
    const [a, b] = resolveView(withTypes({}), 'v')!.nodes;

    expect(a).toMatchObject({ label: 'Servicio A', color: 'blue' });
    expect(b).toMatchObject({ label: 'Base B' });
    expect(b).not.toHaveProperty('color');
  });

  it('the View override wins over the title and the Node kind color', () => {
    const [a, b] = resolveView(withTypes({ overrides: [{ node: 'a', label: 'Entrada', color: 'red' }, { node: 'b', color: 'green' }] }), 'v')!.nodes;

    expect(a).toMatchObject({ label: 'Entrada', color: 'red' });
    expect(b).toMatchObject({ label: 'Base B', color: 'green' });
  });

  it('the Node icon is the Node kind key, if it has one', () => {
    const [a, b] = resolveView(withTypes({}), 'v')!.nodes;

    expect(a).toMatchObject({ icon: 'server' });
    expect(b).not.toHaveProperty('icon');
  });
});
