import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

import { THEME_VARIANT } from '../scripts/screenshots/prototype.ts';

/** `pnpm screenshots` pairs each gallery Theme with a prototype variant: no Theme can be left without a pair. */
it('the Theme -> prototype variant map covers exactly the gallery Themes, without repeated variants', () => {
  const gallery = resolve(import.meta.dirname, '../examples/rinthel-arch/themes');
  const themes = readdirSync(gallery).filter((f) => f.endsWith('.dg')).map((f) => f.replace(/\.dg$/, ''));
  expect(Object.keys(THEME_VARIANT).sort()).toEqual(themes.sort());
  const variants = Object.values(THEME_VARIANT);
  expect(new Set(variants).size).toBe(variants.length);
});
