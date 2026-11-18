import { fileURLToPath } from 'node:url';

import { empaquetar } from './empaquetar';

const ENTRADA = new URL('../navegador/dev.tsx', import.meta.url);
const ENTRADA_DEL_WORKER = new URL('../navegador/worker.ts', import.meta.url);
const ZOD_INERTE = new URL('../navegador/zod-inerte.ts', import.meta.url);

/**
 * El Worker no lleva zod: recibe Metricas ya validadas en la pagina. `zod-inerte` sustituye al paquete para que
 * los esquemas, que se construyen al cargar, no entren al bundle.
 */
export async function empaquetarShellDev(): Promise<{ pagina: string; worker: string }> {
  const [pagina, worker] = await Promise.all([
    empaquetar(ENTRADA),
    empaquetar(ENTRADA_DEL_WORKER, { zod: fileURLToPath(ZOD_INERTE) }),
  ]);
  return { pagina, worker };
}
