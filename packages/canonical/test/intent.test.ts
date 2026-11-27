import { describe, expect, it } from 'vitest';

import { intentSchema } from 'canonical';

describe('intentSchema (union of /api/edit Intents)', () => {
  it('accepts move-pin and rejects an unknown or missing type', () => {
    const pin = { view: 'v', node: 'a', x: 1, y: 2 };
    expect(intentSchema.parse({ type: 'move-pin', ...pin })).toEqual({ type: 'move-pin', ...pin });
    expect(intentSchema.safeParse(pin).success).toBe(false);
    expect(intentSchema.safeParse({ type: 'otra', ...pin }).success).toBe(false);
  });
});
