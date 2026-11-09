import { describe, expect, it } from 'vitest';

import { geometriaCacheadaSchema } from 'canonico';

const anterior = {
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

describe('geometriaCacheadaSchema', () => {
  it('lee como grafo una geometria escrita antes, sin kind', () => {
    const leida = geometriaCacheadaSchema.parse(anterior);

    expect(leida.geometry.kind).toBe('grafo');
    expect(leida.geometry.nodes['a']).toEqual({ x: 0, y: 0, width: 10, height: 5 });
  });

  it('conserva kind grafo cuando ya viene escrito', () => {
    expect(geometriaCacheadaSchema.parse({ ...anterior, geometry: { ...anterior.geometry, kind: 'grafo' } }).geometry.kind).toBe('grafo');
  });

  it('rechaza un kind desconocido', () => {
    expect(geometriaCacheadaSchema.safeParse({ ...anterior, geometry: { ...anterior.geometry, kind: 'otro' } }).success).toBe(false);
  });
});
