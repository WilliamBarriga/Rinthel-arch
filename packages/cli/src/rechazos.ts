/** Tabla unica `MotivoDeRechazo -> salida` para `edit` (codigo de salida) y las rutas de escritura de `dev` (Estado HTTP). */
import type { MotivoDeRechazo } from 'canonico';

export interface RechazoDeEdicion {
  ok: false;
  motivo: MotivoDeRechazo;
  mensaje: string;
  file?: string;
}

export interface SalidaDeRechazo {
  estadoHttp: 409 | 422;
  exitCode: 1;
}

export const SALIDA_DE_RECHAZO: Record<MotivoDeRechazo, SalidaDeRechazo> = {
  'hash-desactualizado': { estadoHttp: 409, exitCode: 1 },
  'archivo-desconocido': { estadoHttp: 422, exitCode: 1 },
  'rango-invalido': { estadoHttp: 422, exitCode: 1 },
  'ediciones-solapadas': { estadoHttp: 422, exitCode: 1 },
  'vista-desconocida': { estadoHttp: 422, exitCode: 1 },
  invalida: { estadoHttp: 422, exitCode: 1 },
  'nada-que-deshacer': { estadoHttp: 422, exitCode: 1 },
  'nada-que-rehacer': { estadoHttp: 422, exitCode: 1 },
  'tema-desconocido': { estadoHttp: 422, exitCode: 1 },
  'entrada-desconocida': { estadoHttp: 422, exitCode: 1 },
};

export function rechazoDeEdicion(motivo: MotivoDeRechazo, mensaje: string, file?: string): RechazoDeEdicion {
  return { ok: false, motivo, mensaje, ...(file === undefined ? {} : { file }) };
}
