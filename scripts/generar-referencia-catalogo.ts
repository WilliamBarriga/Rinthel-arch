/**
 * Writes `docs/theme-catalog.md` from the catalog of `theme`, deterministically.
 * Usage: `pnpm docs:catalogo`; needs `pnpm build` (without it, the import fails).
 */
import { writeFileSync } from 'node:fs';

import { catalogReference } from 'theme';

writeFileSync(new URL('../docs/theme-catalog.md', import.meta.url), catalogReference());
