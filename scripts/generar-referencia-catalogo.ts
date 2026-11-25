/**
 * Escribe `docs/theme-catalog.md` desde el catalogo de `tema`, de forma determinista.
 * Uso: `pnpm docs:catalogo`; necesita `pnpm build` (sin el, falla el import).
 */
import { writeFileSync } from 'node:fs';

import { referenciaDelCatalogo } from 'tema';

writeFileSync(new URL('../docs/theme-catalog.md', import.meta.url), referenciaDelCatalogo());
