import { describe, expect, it } from 'vitest';

import { validateOutputJsonSchema, validateOutputSchema } from 'canonical';

const valid = {
  contractVersion: 2,
  ok: false,
  summary: { errors: 1, warnings: 0, truncated: false },
  issues: [
    {
      code: 'unknown-node-type',
      severity: 'error',
      file: 'main.dg',
      line: 3,
      column: 3,
      message: 'Tipo de nodo no declarado',
      hint: 'Declaralo en specification',
    },
  ],
};

describe('validate output (ADR 0005)', () => {
  it('accepts the versioned object with its issues', () => {
    expect(validateOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects another contract version and unknown severities', () => {
    expect(validateOutputSchema.safeParse({ ...valid, contractVersion: 1 }).success).toBe(false);
    const fatal = { ...valid, issues: [{ ...valid.issues[0], severity: 'fatal' }] };
    expect(validateOutputSchema.safeParse(fatal).success).toBe(false);
  });

  it('requires a 1-based position on each issue', () => {
    const zero = { ...valid, issues: [{ ...valid.issues[0], line: 0 }] };
    expect(validateOutputSchema.safeParse(zero).success).toBe(false);
  });

  it('publishes the contract as a JSON Schema derived from the Zod schema', () => {
    const schema = validateOutputJsonSchema() as {
      properties: Record<string, { properties?: Record<string, unknown>; items?: { properties: Record<string, unknown> } }>;
      required: string[];
    };

    expect(Object.keys(schema.properties).sort()).toEqual(['contractVersion', 'issues', 'ok', 'summary']);
    expect(schema.required).toEqual(expect.arrayContaining(['contractVersion', 'ok', 'summary', 'issues']));
    expect(Object.keys(schema.properties['issues']?.items?.properties ?? {})).toEqual(
      expect.arrayContaining(['code', 'severity', 'file', 'line', 'column', 'message', 'hint', 'related', 'fix']),
    );
  });
});
