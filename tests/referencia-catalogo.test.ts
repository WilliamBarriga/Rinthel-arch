import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { referenciaDelCatalogo } from 'tema';

describe('docs/referencia-catalogo.md', () => {
  it('coincide con el catalogo; si falla, ejecutar `pnpm docs:catalogo`', () => {
    const escrito = readFileSync(new URL('../docs/referencia-catalogo.md', import.meta.url), 'utf8');

    expect(escrito).toBe(referenciaDelCatalogo());
  });
});
