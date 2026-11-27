import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { NEUTRAL_THEME } from 'theme';

describe('layout', () => {
  it('is imported by package name and computes the geometry of a View', async () => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ id: 'a', type: 'servicio', title: 'A' }] },
      views: [{ id: 'v', type: 'architecture', include: ['a'] }],
    });
    const geometry = await layoutView(resolveView(source, 'v')!, NEUTRAL_THEME);
    expect(Object.keys(geometry.nodes)).toEqual(['a']);
  });
});
