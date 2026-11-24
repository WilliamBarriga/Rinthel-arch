import { describe, expect, it } from 'vitest';

import { intencionSchema } from 'canonico';

describe('intencionSchema (union de Intenciones de /api/edit)', () => {
  it('acepta move-pin y rechaza un tipo desconocido o ausente', () => {
    const pin = { vista: 'v', nodo: 'a', x: 1, y: 2 };
    expect(intencionSchema.parse({ tipo: 'move-pin', ...pin })).toEqual({ tipo: 'move-pin', ...pin });
    expect(intencionSchema.safeParse(pin).success).toBe(false);
    expect(intencionSchema.safeParse({ tipo: 'otra', ...pin }).success).toBe(false);
  });
});
