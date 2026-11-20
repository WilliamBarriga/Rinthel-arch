/**
 * `pnpm --filter estudio build` (tras tsup): regenera las palabras clave del editor desde la gramatica y deja los
 * estaticos de la app en `dist/estudio/`.
 */
import { fileURLToPath } from 'node:url';

import { construirEstudio } from './empaquetar.ts';
import { generarPalabrasClave } from './palabras-clave.ts';

generarPalabrasClave();
await construirEstudio({ salida: fileURLToPath(new URL('../dist/estudio/', import.meta.url)) });
