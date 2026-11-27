import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';
import { CATALOG, buildPrimitive, resolvedStyle } from 'theme';
import type { PropertyDefinition } from 'theme';

const example = readFileSync(resolve(import.meta.dirname, '../examples/themes/shape-catalog.dg'), 'utf8');
const { canonical, issues } = compile({ 'shape-catalog.dg': example });

const FAMILIES = ['forma', 'relleno', 'borde'];
const fromCatalog = Object.entries(CATALOG).filter(([, p]) => FAMILIES.includes(p.family));

/** Valid value of a property to build the Primitive: the default, or a Palette color. */
const valueOf = (p: PropertyDefinition): string | number => (p.type === 'color' ? 'ink' : p.type === 'name' ? 'Example' : p.type === 'option' ? (p.default ?? p.values[0]!) : p.type === 'text' ? 'x' : (p.default ?? p.min));

type ThemeWithLayers = { nodo?: { capas: Array<{ primitiva: { tipo: string } }> } };

describe('catalog of shapes, fills and borders', () => {
  it('the example Theme compiles without issues', () => {
    expect(issues).toEqual([]);
  });

  it.each(fromCatalog.map(([name]) => name))('%s appears in an example Theme', (name) => {
    const definition = CATALOG[name as keyof typeof CATALOG];
    const props = Object.entries(definition.properties).map(([key, p]) => ({ key, value: valueOf(p as PropertyDefinition) }));
    const { errors } = buildPrimitive(name, props, { ink: '#111111' });
    const usedIn = (canonical?.themes ?? []).filter((t) => ((t as unknown as ThemeWithLayers).nodo?.capas ?? []).some((c) => c.primitiva.tipo === name));

    expect(errors).toEqual([]);
    expect(usedIn.length).toBeGreaterThan(0);
  });

  it('every example Theme resolves its Style without throwing', () => {
    for (const theme of canonical!.themes) expect(() => resolvedStyle(theme, { diagrama: 'architecture' })).not.toThrow();
  });
});
