import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';

const node = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.split('.').pop(), description: '', children });

/** a { a1 { a1x } a2 }, c. */
function view(state = {}): ResolvedView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [node('a', [node('a.a1', [node('a.a1.x')]), node('a.a2')]), node('c')] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  return resolveView(source, 'v', state)!;
}

const box = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

describe('geometryIndex', () => {
  it('adds the positions of ancestor Groups to each absolute box', () => {
    const index = geometryIndex(view(), {
      nodes: { a: box(100, 200), 'a.a1': box(10, 20), 'a.a1.x': box(1, 2), 'a.a2': box(5, 6), c: box(7, 8) },
    });
    expect(index.boxes.get('a')).toEqual(box(100, 200));
    expect(index.boxes.get('a.a1')).toEqual(box(110, 220));
    expect(index.boxes.get('a.a1.x')).toEqual(box(111, 222));
    expect(index.boxes.get('a.a2')).toEqual(box(105, 206));
    expect(index.boxes.get('c')).toEqual(box(7, 8));
  });

  it('gives the parent of each nested Node and the roots are the ones nobody nests', () => {
    const index = geometryIndex(view(), { nodes: {} });
    expect(Object.fromEntries(index.parent)).toEqual({ 'a.a1': 'a', 'a.a1.x': 'a.a1', 'a.a2': 'a' });
    expect(index.roots.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('a collapsed Group is a leaf: its children are left out', () => {
    const index = geometryIndex(view({ collapsed: ['a'] }), { nodes: { a: box(3, 4), c: box(0, 0) } });
    expect([...index.boxes.keys()].sort()).toEqual(['a', 'c']);
    expect(index.parent.size).toBe(0);
    expect(index.roots.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('skips the Nodes without a box in the geometry', () => {
    const index = geometryIndex(view(), { nodes: { a: box(1, 1), c: box(2, 2) } });
    expect([...index.boxes.keys()].sort()).toEqual(['a', 'c']);
  });
});
