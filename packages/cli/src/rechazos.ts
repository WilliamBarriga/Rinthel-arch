/**
 * Rechazo de `edit` (codigo de salida 1 para todo motivo). El estado HTTP de las rutas de escritura de `dev` es
 * `estadoHttpDeRechazo` de `canonico`, el mismo que usa `devEnMemoria`.
 */
import type { MotivoDeRechazo } from 'canonico';

export interface RechazoDeEdicion {
  ok: false;
  motivo: MotivoDeRechazo;
  mensaje: string;
  file?: string;
}

export const CODIGO_DE_RECHAZO = 1;
