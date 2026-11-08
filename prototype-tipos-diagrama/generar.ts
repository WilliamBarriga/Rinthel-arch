/**
 * PROTOTIPO (desechable). Empaqueta `construir.ts` con esbuild (importa internos de `render/src`) y lo ejecuta.
 * Uso: `pnpm build` una vez y luego `node prototype-tipos-diagrama/generar.ts`; sirve la raiz del repo y abre
 * `http://localhost:<puerto>/prototype-tipos-diagrama/out/index.html?variant=neutral`.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const salida = join(import.meta.dirname, 'construir.bundle.mjs');
await build({ entryPoints: [join(import.meta.dirname, 'construir.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: salida, logLevel: 'warning' });
await import(pathToFileURL(salida).href);
