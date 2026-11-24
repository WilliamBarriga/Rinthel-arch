import { describe, expect, it } from 'vitest';

import { intencionSchema } from 'canonico';

describe('intencionSchema (union de Intenciones de /api/edit)', () => {
  it('acepta move-pin y rechaza un tipo desconocido o ausente', () => {
    const pin = { view: 'v', node: 'a', x: 1, y: 2 };
    expect(intencionSchema.parse({ type: 'move-pin', ...pin })).toEqual({ type: 'move-pin', ...pin });
    expect(intencionSchema.safeParse(pin).success).toBe(false);
    expect(intencionSchema.safeParse({ type: 'otra', ...pin }).success).toBe(false);
  });
});
