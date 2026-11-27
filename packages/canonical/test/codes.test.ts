import { describe, expect, it } from 'vitest';

import { CODES, DEPRECATED_CODES, CODE_DESCRIPTION } from 'canonical';

/** Written by hand, not from the catalog: adding a code is a contract change reviewed here. */
const v1Codes = [
  'syntax-error',
  'unknown-node-type',
  'duplicate-node',
  'dangling-edge',
  'unknown-attribute',
  'unknown-palette-color',
  'extends-cycle',
  'duplicate-theme',
  'unknown-theme',
  'unknown-view-link',
  'invalid-expansion-target',
  'link-with-expanded',
  'unknown-step',
  'step-not-projected',
  'step-not-advancing',
  'steps-each-with-step',
  'link-not-lifeline',
  'unknown-view-type',
  'view-property-for-type',
  'sequence-without-interaction',
  'unknown-interaction',
  'duplicate-interaction',
  'unknown-lifeline',
  'duplicate-message-id',
  'create-not-first',
  'after-destroy',
  'invalid-fragment-operand',
  'order-not-in-interaction',
  'ref-without-view',
  'reply-without-sync',
  'unknown-extend-target',
  'override-outside-view',
  'unknown-icon',
  'overlapping-pins',
  'theme-unknown-primitive',
  'theme-unknown-property',
  'theme-invalid-value',
  'theme-unknown-slot',
  'theme-duplicate-layer',
  'theme-unknown-token',
  'theme-unknown-layer',
  'theme-patch-without-placement',
  'theme-state-touches-metrics',
  'theme-unknown-state',
  'theme-unknown-diagram-type',
  'theme-unknown-part',
  'theme-unknown-motion',
  'duplicate-part',
  'theme-low-contrast',
  'theme-color-only',
  'theme-with-code',
  'theme-component-missing',
  'theme-component-params',
  'theme-component-duplicate',
  'theme-code-compile',
  'theme-font-missing',
  'theme-font-no-fallback',
  'theme-font-not-served',
  'duplicate-key-mark',
  'er-cardinality',
  'old-catalog-value',
  'old-workspace-convention',
  'real-node-in-planned-group',
  'planned-with-path',
  'unknown-source-kind',
];

describe('Issue code catalog', () => {
  it('exports the minimum v1 codes from spec #19 as constants', () => {
    expect(Object.values(CODES).sort()).toEqual([...v1Codes].sort());
  });

  it('deprecates and never recycles: every code ever emitted is unique', () => {
    const active = Object.values(CODES);
    const historical = [...active, ...DEPRECATED_CODES];

    expect(new Set(historical).size).toBe(historical.length);
    expect(active.filter((code) => DEPRECATED_CODES.includes(code))).toEqual([]);
  });

  it('retires unknown-edge-style-type without recycling its value', () => {
    expect(DEPRECATED_CODES).toContain('unknown-edge-style-type');
  });

  it('uses English kebab-case codes; the key is the upper-case code with a severity prefix', () => {
    for (const [key, code] of Object.entries(CODES)) {
      expect(code).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(key.slice(2)).toBe(code.toUpperCase().replaceAll('-', '_'));
    }
    expect(Object.isFrozen(CODES)).toBe(true);
  });

  it('describes each active code in one sentence, for the agent skill', () => {
    expect(Object.keys(CODE_DESCRIPTION).sort()).toEqual(Object.values(CODES).sort());
    for (const description of Object.values(CODE_DESCRIPTION)) {
      expect(description.trim().length).toBeGreaterThan(10);
    }
  });
});
