/** Bundles del navegador para `dev`: la pagina viva (`navegador/dev.tsx`) y el Worker de layout. */
import { fileURLToPath } from 'node:url';

import { empaquetar } from './empaquetar';

const ENTRADA = new URL('../navegador/dev.tsx', import.meta.url);
const ENTRADA_DEL_WORKER = new URL('../navegador/worker.ts', import.meta.url);
const ZOD_INERTE = new URL('../navegador/zod-inerte.ts', import.meta.url);

export async function empaquetarShellDev(): Promise<{ pagina: string; worker: string }> {
  const [pagina, worker] = await Promise.all([
    empaquetar(ENTRADA),
    empaquetar(ENTRADA_DEL_WORKER, { zod: fileURLToPath(ZOD_INERTE) }),
  ]);
  return { pagina, worker };
}
