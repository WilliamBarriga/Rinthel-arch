import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { NEUTRAL_THEME } from 'theme';

describe('layout', () => {
  it('se importa por nombre de paquete y calcula la geometria de una Vista', async () => {
    const fuente = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ id: 'a', type: 'servicio', title: 'A' }] },
      views: [{ id: 'v', type: 'architecture', include: ['a'] }],
    });
    const geometria = await layoutView(resolveView(fuente, 'v')!, NEUTRAL_THEME);
    expect(Object.keys(geometria.nodes)).toEqual(['a']);
  });
});
