import type { MotivoDeRechazo } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { aplicarEdiciones, hashDeContenido, reemplazarTexto } from './ediciones';
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

/**
 * Edicion de texto `{ file, range, replacement }` con `hash` opcional: sin el, la concurrencia la decide `visto[file]`
 * (la `version` que vio la UI traducida a hashes) y, sin ninguno, se aplica sobre el texto vigente.
 */
export type EdicionDeTexto = Omit<EdicionConHash, 'hash'> & { hash?: string };

export type Aplicable = Intencion | readonly EdicionDeTexto[];

export interface OpcionesDeAplicar {
  /**
   * Solo para listas de ediciones: escribe aunque el resultado tenga errores nuevos (guardado del editor, ADR 0007).
   * Por defecto `false`: una edicion que introduce un error se rechaza con `invalid` (`edit --edits`, `fix`).
   */
  aunqueNoCompile?: boolean;
}

export type ResultadoDeAplicar =
  | { ok: true; cambiados: string[]; ediciones: EdicionConHash[] }
  | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

const cambiadosEntre = (antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace): string[] =>
  Object.keys(despues)
    .filter((f) => despues[f] !== antes[f])
    .sort();

/**
 * Puerta de escritura unica: lee fresco por el puerto, aplica una Intencion o ediciones de texto (las dos con `visto`;
 * una edicion con `hash` propio lo usa antes que `visto`) y escribe solo los archivos propios que cambian. Todo o nada.
 * Cambiar un archivo ajeno (p. ej. de `--theme-path`) rechaza con `unknown-file`. Los fallos de I/O del puerto se propagan.
 */
export function aplicarAlWorkspace(puerto: PuertoDeWorkspace, aplicable: Aplicable, visto?: Visto, opciones: OpcionesDeAplicar = {}): ResultadoDeAplicar {
  const { disco, propios } = puerto.leer();
  let r;
  if (esListaDeEdiciones(aplicable)) {
    const ediciones = aplicable.map((e) => ({ ...e, hash: e.hash ?? visto?.[e.file] ?? hashDeContenido(disco[e.file] ?? '') }));
    r = { ...(opciones.aunqueNoCompile === true ? reemplazarTexto(disco, ediciones) : aplicarEdiciones(disco, ediciones)), ediciones };
  } else {
    r = aplicarIntencion(disco, aplicable, visto);
  }
  if (!r.ok) return { ok: false, motivo: r.motivo, mensaje: r.mensaje, ...(r.file === undefined ? {} : { file: r.file }) };
  const cambiados = cambiadosEntre(disco, r.archivos);
  const fuera = cambiados.find((f) => !(f in propios));
  if (fuera !== undefined) {
    return { ok: false, motivo: 'unknown-file', mensaje: `'${fuera}' does not belong to the Workspace`, file: fuera };
  }
  for (const ruta of cambiados) puerto.escribir(ruta, r.archivos[ruta] as string);
  return { ok: true, cambiados, ediciones: r.ediciones };
}

const esListaDeEdiciones = (aplicable: Aplicable): aplicable is readonly EdicionDeTexto[] => Array.isArray(aplicable);
