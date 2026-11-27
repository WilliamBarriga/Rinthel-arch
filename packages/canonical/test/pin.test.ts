import { describe, expect, it } from 'vitest';

import { pinIntentSchema, editOutputSchema } from 'canonical';
import type { PinIntent } from 'canonical';

describe('pinIntentSchema', () => {
  it('accepts the Intent to move a Pin { view, node, x, y } and drops a legacy hash', () => {
    const body = { view: 'arquitectura', node: 'rinthel.api', x: 10.5, y: -3 };

    expect(pinIntentSchema.parse(body)).toEqual(body);
    expect(pinIntentSchema.parse({ ...body, hash: 'abc123' })).toEqual(body);
  });

  it('rejects non-finite coordinates', () => {
    for (const x of [Infinity, -Infinity, NaN, '5', null]) {
      const body = { view: 'v', node: 'a', x, y: 0 };

      expect(pinIntentSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects an incomplete body or one with fields of another type', () => {
    const intent: PinIntent = { view: 'v', node: 'a', x: 0, y: 0 };
    const tainted = (field: keyof Omit<PinIntent, 'x' | 'y'> | 'x' | 'y'): Record<string, unknown> => ({
      ...intent,
      [field]: field === 'x' || field === 'y' ? 'norte' : 42,
    });

    expect(pinIntentSchema.safeParse(tainted('view')).success).toBe(false);
    expect(pinIntentSchema.safeParse(tainted('node')).success).toBe(false);
    expect(pinIntentSchema.safeParse(tainted('x')).success).toBe(false);
    expect(pinIntentSchema.safeParse(tainted('y')).success).toBe(false);
    expect(pinIntentSchema.safeParse({ view: 'v', node: 'a', x: 0 }).success).toBe(false);
  });
});

describe('RejectionReason', () => {
  it('feeds the reason enum of the edit output (one place per reason)', () => {
    // Written by hand as an independent source of truth.
    const reasons = [
      'stale-hash',
      'unknown-file',
      'invalid-range',
      'overlapping-edits',
      'unknown-view',
      'invalid',
      'nothing-to-undo',
      'nothing-to-redo',
      'unknown-theme',
      'unknown-entry',
      'invalid-rename',
    ] as const;

    for (const reason of reasons) {
      const output = editOutputSchema.safeParse({ contractVersion: 2, ok: false, reason, message: 'x' });

      expect(output.success, reason).toBe(true);
    }
    expect(editOutputSchema.safeParse({ contractVersion: 2, ok: false, reason: 'futuro', message: 'x' }).success).toBe(false);
  });
});
