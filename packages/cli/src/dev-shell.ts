/** Bundles del navegador para `dev`: la pagina viva (`navegador/dev.tsx`) y el Worker de layout. */
import { fileURLToPath } from 'node:url';

import { empaquetar } from './empaquetar';

const ENTRADA = new URL('../navegador/dev.tsx', import.meta.url);
const ENTRADA_DEL_WORKER = new URL('../navegador/worker.ts', import.meta.url);
const ZOD_INERTE = new URL('../navegador/zod-inerte.ts', import.meta.url);

/**
 * El Worker no lleva zod: recibe Metricas ya resueltas (el Tema se valida una vez, en la pagina; ADR 0003,
 * enmienda) y solo carga `canonico` y `tema` por sus funciones sin validacion. `zod-inerte` sustituye al
 * paquete para que sus esquemas, que se construyen al cargar, no entren al bundle.
 */
export async function empaquetarShellDev(): Promise<{ pagina: string; worker: string }> {
  const [pagina, worker] = await Promise.all([
    empaquetar(ENTRADA),
    empaquetar(ENTRADA_DEL_WORKER, { zod: fileURLToPath(ZOD_INERTE) }),
  ]);
  return { pagina, worker };
}
