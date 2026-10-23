import type { MotivoDeRechazo } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { aplicarIntencion } from './intenciones';
import type { Intencion } from './intenciones';

/**
 * Puerto del Workspace en disco (adaptador en `cli`; fake en memoria en las pruebas).
 * `leer` da `disco` (Workspace mas Temas de `--theme-path`, lo que se compila) y
 * `propios` (solo los archivos del Workspace, los unicos escribibles). Los fallos de
 * I/O se propagan como excepcion.
 */
export interface PuertoDeWorkspace {
  leer(): { disco: ArchivosDelWorkspace; propios: ArchivosDelWorkspace };
  escribir(ruta: string, texto: string): void;
}

export type ResultadoDeAplicar =
  | { ok: true; cambiados: string[] }
  | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

/**
 * Archivos que cambia una edicion (ordenados) y el primero que no pertenece al
 * Workspace (viene de `--theme-path`): solo se escribe en la raiz del Workspace.
 */
export function cambiosDeEdicion(
  antes: ArchivosDelWorkspace,
  despues: ArchivosDelWorkspace,
  propios: ArchivosDelWorkspace,
): { cambiados: string[]; fuera: string | undefined } {
  const cambiados = Object.keys(despues)
    .filter((f) => despues[f] !== antes[f])
    .sort();
  return { cambiados, fuera: cambiados.find((f) => !(f in propios)) };
}

/**
 * Aplica una Intencion al Workspace: lee fresco, reduce con `aplicarIntencion`
 * (calcular, auto-probar, aplicar en memoria) y escribe solo los archivos propios
 * que cambian. Todo o nada: un rechazo no escribe nada.
 */
export function aplicarAlWorkspace(puerto: PuertoDeWorkspace, intencion: Intencion): ResultadoDeAplicar {
  const { disco, propios } = puerto.leer();
  const r = aplicarIntencion(disco, intencion);
  if (!r.ok) return { ok: false, motivo: r.motivo, mensaje: r.mensaje, ...(r.file === undefined ? {} : { file: r.file }) };
  const { cambiados, fuera } = cambiosDeEdicion(disco, r.archivos, propios);
  if (fuera !== undefined) {
    return { ok: false, motivo: 'archivo-desconocido', mensaje: `'${fuera}' no pertenece al Workspace`, file: fuera };
  }
  for (const ruta of cambiados) puerto.escribir(ruta, r.archivos[ruta] as string);
  return { ok: true, cambiados };
}
