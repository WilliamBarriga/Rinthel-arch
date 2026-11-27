/**
 * Rechazo de `edit` (codigo de salida 1 para todo motivo). El estado HTTP de las rutas de escritura de `dev` es
 * `rejectionHttpStatus` de `canonical`, el mismo que usa `inMemoryDev`.
 */
import type { RejectionReason } from 'canonical';

export interface RechazoDeEdicion {
  ok: false;
  reason: RejectionReason;
  message: string;
  file?: string;
}

export const CODIGO_DE_RECHAZO = 1;
