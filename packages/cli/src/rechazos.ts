/**
 * Tabla unica `MotivoDeRechazo -> salida` de los dos transportes de la edicion
 * estructurada (ADR 0005): el comando `edit` (codigo de salida) y `POST /api/pin`
 * de `dev` (Estado HTTP). Los dos canales leen la misma fila; anadir un motivo a
 * `canonico` obliga a una fila nueva aqui (el `Record` lo exige al compilar).
 * `archivo-desconocido` tambien sale por la tabla cuando lo detecta el epilogo de
 * I/O de cada canal (el archivo editado no pertenece al Workspace).
 */
import type { MotivoDeRechazo } from 'canonico';

/** Fallo comun de una edicion, tal como lo devuelve `sesion`: cuerpo de `dev` y base de `edit --json`. */
export interface RechazoDeEdicion {
  ok: false;
  motivo: MotivoDeRechazo;
  mensaje: string;
  file?: string;
}

/** Como sale cada motivo en cada canal: codigo de `edit` y Estado HTTP de `POST /api/pin`. */
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
};

/** Rechazo con la forma comun (`ok`, `motivo`, `mensaje`, `file`), para las respuestas manuales de I/O. */
export function rechazoDeEdicion(motivo: MotivoDeRechazo, mensaje: string, file?: string): RechazoDeEdicion {
  return { ok: false, motivo, mensaje, ...(file === undefined ? {} : { file }) };
}
