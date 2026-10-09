import { describe, expect, it } from 'vitest';

import { CODIGOS, fuenteCanonicaSchema, resolveView, revealAt, validate } from 'canonico';

describe('canonico', () => {
  it('se importa por nombre de paquete y expone su interfaz', () => {
    const fuente = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ id: 'a', type: 'servicio', title: 'A' }] },
      views: [{ id: 'v', type: 'architecture', include: ['a'] }],
    });
    expect(validate(fuente)).toEqual([]);
    const vista = resolveView(fuente, 'v');
    expect(vista?.nodes.map((nodo) => nodo.id)).toEqual(['a']);
    expect(revealAt(vista!, 0)('a')).toBe(1);
    expect(CODIGOS.E_SYNTAX_ERROR).toBe('E_SYNTAX_ERROR');
  });
});
