import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogReference } from 'theme';

describe('docs/theme-catalog.md', () => {
  it('coincide con el catalogo; si falla, ejecutar `pnpm docs:catalogo`', () => {
    const escrito = readFileSync(new URL('../docs/theme-catalog.md', import.meta.url), 'utf8');

    expect(escrito).toBe(catalogReference());
  });
});
