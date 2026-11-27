import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';

import { pathStates, moveFocus, focusOrder, shortestPath, mergeStates } from '../src/path-and-focus';

const node = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id, description: '', children });
const edge = (from: string, to: string) => ({ from: { node: from }, to: { node: to } });

/** g { g.x } ; a -> b -> c ; a -> d ; e (isolated) */
const view = resolveView(
  canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [node('g', [node('g.x')]), node('a'), node('b'), node('c'), node('d'), node('e')],
      edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'd')],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  }),
  'v',
)!;

describe('keyboard focus', () => {
  it('Nodes and Groups are walked in Model order and focus leaves at the ends', () => {
    expect(focusOrder(view)).toEqual(['g', 'g.x', 'a', 'b', 'c', 'd', 'e']);
    expect(moveFocus(view, undefined, 'siguiente')).toBe('g');
    expect(moveFocus(view, 'g', 'siguiente')).toBe('g.x');
    expect(moveFocus(view, 'e', 'siguiente')).toBeUndefined();
    expect(moveFocus(view, 'g', 'anterior')).toBeUndefined();
    expect(moveFocus(view, 'b', 'anterior')).toBe('a');
  });

  it('arrows jump along Edges to the neighbor and, without a neighbor, focus does not change', () => {
    expect(moveFocus(view, 'a', 'adelante')).toBe('b');
    expect(moveFocus(view, 'c', 'atras')).toBe('b');
    expect(moveFocus(view, 'b', 'atras')).toBe('a');
    expect(moveFocus(view, 'e', 'adelante')).toBe('e');
    expect(moveFocus(view, 'c', 'adelante')).toBe('c');
  });
});

describe('ruta', () => {
  it('the shortest path follows the direction of the Edges and, without a directed way, ignores it', () => {
    expect(shortestPath(view, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(shortestPath(view, 'c', 'a')).toEqual(['c', 'b', 'a']);
    expect(shortestPath(view, 'd', 'c')).toEqual(['d', 'a', 'b', 'c']);
    expect(shortestPath(view, 'a', 'e')).toBeUndefined();
  });

  it('highlighting a path puts on-path what makes it up and dims the rest', () => {
    const states = pathStates(view, ['a', 'b', 'c']);

    expect(states['a']).toEqual(['on-path']);
    expect(states['c']).toEqual(['on-path']);
    expect(states['a -> b']).toEqual(['on-path']);
    expect(states['b -> c']).toEqual(['on-path']);
    expect(states['a -> d']).toEqual(['dimmed']);
    for (const id of ['g', 'g.x', 'd', 'e']) expect(states[id]).toEqual(['dimmed']);
  });

  it('without a path nothing is dimmed', () => {
    expect(pathStates(view, [])).toEqual({});
  });

  it('mergeStates concatenates those of each id', () => {
    expect(mergeStates({ a: ['selected'] }, { a: ['on-path'], b: ['focus'] })).toEqual({ a: ['selected', 'on-path'], b: ['focus'] });
  });
});
