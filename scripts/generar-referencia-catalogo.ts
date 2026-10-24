/**
 * Escribe `docs/referencia-catalogo.md` desde el catalogo de `tema`.
 * Uso: `pnpm docs:catalogo` (necesita `pnpm build`). La prueba
 * `tests/referencia-catalogo.test.ts` falla si el archivo se desvia del catalogo.
 *
 * Interfaz: sin argumentos. Invariantes: salida determinista. Modo de error:
 * si falta el build de `tema`, el import falla con el error de Node.
 */
import { writeFileSync } from 'node:fs';

import { referenciaDelCatalogo } from 'tema';

writeFileSync(new URL('../docs/referencia-catalogo.md', import.meta.url), referenciaDelCatalogo());
