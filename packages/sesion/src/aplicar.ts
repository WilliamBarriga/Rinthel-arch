import type { MotivoDeRechazo } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { aplicarEdiciones } from './ediciones';
import type { EdicionConHash } from './ediciones';
import { aplicarIntencion } from './intenciones';
import type { Intencion, Visto } from './intenciones';

/**
 * `leer` da `disco` (Workspace mas Temas de `--theme-path`, lo que se compila) y `propios` (los unicos escribibles).
 * Los fallos de I/O se propagan como excepcion.
 */
export interface PuertoDeWorkspace {
  leer(): { disco: ArchivosDelWorkspace; propios: ArchivosDelWorkspace };
  escribir(ruta: string, texto: string): void;
}

export type Aplicable = Intencion | readonly EdicionConHash[];

export type ResultadoDeAplicar =
  | { ok: true; cambiados: string[]; ediciones: EdicionConHash[] }
  | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

const cambiadosEntre = (antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace): string[] =>
  Object.keys(despues)
    .filter((f) => despues[f] !== antes[f])
    .sort();

/**
 * Puerta de escritura unica: lee fresco por el puerto, aplica una Intencion (con `visto`) o ediciones con hash (sin `visto`)
 * y escribe solo los archivos propios que cambian. Todo o nada. Cambiar un archivo ajeno (p. ej. de `--theme-path`)
 * rechaza con `archivo-desconocido`. Los fallos de I/O del puerto se propagan.
 */
export function aplicarAlWorkspace(puerto: PuertoDeWorkspace, aplicable: Aplicable, visto?: Visto): ResultadoDeAplicar {
  const { disco, propios } = puerto.leer();
  const r = esListaDeEdiciones(aplicable)
    ? { ...aplicarEdiciones(disco, aplicable), ediciones: [...aplicable] }
    : aplicarIntencion(disco, aplicable, visto);
  if (!r.ok) return { ok: false, motivo: r.motivo, mensaje: r.mensaje, ...(r.file === undefined ? {} : { file: r.file }) };
  const cambiados = cambiadosEntre(disco, r.archivos);
  const fuera = cambiados.find((f) => !(f in propios));
  if (fuera !== undefined) {
    return { ok: false, motivo: 'archivo-desconocido', mensaje: `'${fuera}' no pertenece al Workspace`, file: fuera };
  }
  for (const ruta of cambiados) puerto.escribir(ruta, r.archivos[ruta] as string);
  return { ok: true, cambiados, ediciones: r.ediciones };
}

const esListaDeEdiciones = (aplicable: Aplicable): aplicable is readonly EdicionConHash[] => Array.isArray(aplicable);
