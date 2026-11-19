/** `pnpm --filter estudio build` (tras tsup): deja los estaticos de la app en `dist/estudio/`. */
import { fileURLToPath } from 'node:url';

import { construirEstudio } from './empaquetar.ts';

await construirEstudio({ salida: fileURLToPath(new URL('../dist/estudio/', import.meta.url)) });
