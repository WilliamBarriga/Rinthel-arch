/** Bundles del navegador para `dev`: la pagina viva (`navegador/dev.tsx`) y el Worker de layout. */
import { empaquetar } from './empaquetar';

const ENTRADA = new URL('../navegador/dev.tsx', import.meta.url);
const ENTRADA_DEL_WORKER = new URL('../navegador/worker.ts', import.meta.url);

/**
 * El Worker lleva zod completo: el layout resuelve el Tema (`resolverTema`, `tablaDeMetricas`) y eso valida con
 * el esquema del Tema. Con un zod inerte (el recorte de tamano del ADR 0003) el Worker falla en cuanto el visor
 * pide un layout nuevo, p. ej. con las medidas reales de fuente.
 */
export async function empaquetarShellDev(): Promise<{ pagina: string; worker: string }> {
  const [pagina, worker] = await Promise.all([
    empaquetar(ENTRADA),
    empaquetar(ENTRADA_DEL_WORKER),
  ]);
  return { pagina, worker };
}
