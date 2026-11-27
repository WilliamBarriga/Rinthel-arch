import { describe, expect, it } from 'vitest';

import { cachedGeometrySchema } from 'canonical';

const previous = {
  view: 'general',
  theme: 'neutral',
  layoutKey: 'k',
  geometry: {
    nodes: { a: { x: 0, y: 0, width: 10, height: 5 } },
    edges: {},
    kind: 'grafo',
    pinsSolapados: [],
    width: 10,
    height: 5,
  },
};

describe('cachedGeometrySchema', () => {
  it('reads a geometry written earlier without kind as grafo', () => {
    const read = cachedGeometrySchema.parse(previous);

    expect(read.geometry.kind).toBe('grafo');
    expect(read.geometry.nodes['a']).toEqual({ x: 0, y: 0, width: 10, height: 5 });
  });

  it('keeps kind grafo when it is already written', () => {
    expect(cachedGeometrySchema.parse({ ...previous, geometry: { ...previous.geometry, kind: 'grafo' } }).geometry.kind).toBe('grafo');
  });

  it('does not allow a mirrored footer header in a sequence geometry', () => {
    const box = { x: 0, y: 0, width: 10, height: 5 };
    const geometry = {
      kind: 'secuencia',
      nodes: { a: box },
      lifelines: { a: { x: 5, y1: 5, y2: 50 } },
      activations: [],
      messages: {},
      fragments: [],
      notes: [],
      groups: [],
      width: 10,
      height: 60,
    };
    const read = cachedGeometrySchema.parse({ ...previous, geometry: { ...geometry, footers: { a: { ...box, y: 50 } } } }).geometry;
    expect(read).toEqual(geometry);
    expect(read).not.toHaveProperty('footers');
  });

  it('rejects an unknown kind', () => {
    expect(cachedGeometrySchema.safeParse({ ...previous, geometry: { ...previous.geometry, kind: 'otro' } }).success).toBe(false);
  });
});
