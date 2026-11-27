import { describe, expect, it } from 'vitest';

import { CODES, canonicalFormSchema, resolveView, revealAt, validate } from 'canonical';

describe('canonical', () => {
  it('is imported by package name and exposes its interface', () => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ id: 'a', type: 'servicio', title: 'A' }] },
      views: [{ id: 'v', type: 'architecture', include: ['a'] }],
    });
    expect(validate(source)).toEqual([]);
    const view = resolveView(source, 'v');
    expect(view?.nodes.map((node) => node.id)).toEqual(['a']);
    expect(revealAt(view!, 0)('a')).toBe(1);
    expect(CODES.E_SYNTAX_ERROR).toBe('syntax-error');
  });
});
