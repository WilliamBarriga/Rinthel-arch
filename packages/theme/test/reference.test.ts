import { describe, expect, it } from 'vitest';

import { CATALOG, EFFECTS, MOTIONS, SLOTS, catalogReference } from '../src';

describe('catalogReference', () => {
  const text = catalogReference();
  const row = (name: string): string => text.split('\n').find((line) => line.startsWith(`| \`${name}\` |`)) ?? '';

  it('is deterministic', () => {
    expect(catalogReference()).toBe(text);
  });

  it('lists each Primitive, Slot, Motion and Effect of the catalog', () => {
    for (const name of Object.keys(CATALOG)) expect(row(name), name).not.toBe('');
    for (const name of [...SLOTS, ...Object.keys(MOTIONS), ...EFFECTS]) expect(row(name), name).not.toBe('');
  });

  it('shows range and default of a numeric property', () => {
    expect(row('glow')).toContain('`radius` 1 to 100 (12)');
  });

  it('shows the options and marks the Primitives that affect the Metrics', () => {
    expect(row('circle')).toMatch(/\| yes \|/);
    expect(row('rect')).toMatch(/\| no \|/);
    expect(row('line')).toMatch(/`style` solid\|/);
  });

  it('states that it is generated', () => {
    expect(text).toContain('Generated');
  });
});
