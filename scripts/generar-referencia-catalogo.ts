/**
 * Escribe `docs/referencia-catalogo.md` desde el catalogo de `tema`, de forma determinista.
 * Uso: `pnpm docs:catalogo`; necesita `pnpm build` (sin el, falla el import).
 */
import { writeFileSync } from 'node:fs';

import { referenciaDelCatalogo } from 'tema';

writeFileSync(new URL('../docs/referencia-catalogo.md', import.meta.url), referenciaDelCatalogo());
