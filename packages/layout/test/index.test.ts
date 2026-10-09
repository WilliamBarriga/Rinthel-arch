import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';

describe('layout', () => {
  it('se importa por nombre de paquete y calcula la geometria de una Vista', async () => {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ id: 'a', type: 'servicio', title: 'A' }] },
      views: [{ id: 'v', type: 'architecture', include: ['a'] }],
    });
    const geometria = await layoutView(resolveView(fuente, 'v')!, TEMA_NEUTRO);
    expect(Object.keys(geometria.nodes)).toEqual(['a']);
  });
});
