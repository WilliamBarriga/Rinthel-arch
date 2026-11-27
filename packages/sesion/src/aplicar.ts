import type { RejectionReason } from 'canonical';
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
  /**
   * Renames a Workspace path (file or folder, `/`-separated) for an edit with `rename` (the `fix` of
   * `old-workspace-convention`). Without it (and `existe`), such an edit is rejected with `invalid-rename`.
   */
  renombrar?(antigua: string, nueva: string): void;
  /** Whether a Workspace path (file or folder) exists. */
  existe?(ruta: string): boolean;
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
  | { ok: true; cambiados: string[]; ediciones: EdicionConHash[]; renombrados: Renombrado[] }
  | { ok: false; reason: RejectionReason; message: string; file?: string };

/** A path renamed by an edit: `file` is the old path, `rename` the new one. */
export interface Renombrado {
  file: string;
  rename: string;
}

type Rechazo = Extract<ResultadoDeAplicar, { ok: false }>;

const invalido = (message: string, file?: string): Rechazo => ({ ok: false, reason: 'invalid-rename', message, ...(file === undefined ? {} : { file }) });
const dentro = (ruta: string, carpeta: string): boolean => ruta === carpeta || ruta.startsWith(`${carpeta}/`);
const rutaValida = (ruta: string): boolean => ruta !== '' && !ruta.startsWith('/') && !/^[A-Za-z]:/.test(ruta) && ruta.split('/').every((s) => s !== '' && s !== '.' && s !== '..');

/** Checks every rename before anything is written: the whole batch is rejected if one is impossible. */
function comprobarRenombres(puerto: PuertoDeWorkspace, renombres: readonly Renombrado[]): Rechazo | undefined {
  const { renombrar, existe } = puerto;
  if (renombrar === undefined || existe === undefined) return invalido('This writer cannot rename files; rename the path by hand');
  for (const [i, { file, rename }] of renombres.entries()) {
    if (!rutaValida(file) || !rutaValida(rename)) return invalido(`Cannot rename '${file}' to '${rename}': both must be relative paths inside the Workspace`, file);
    if (!existe(file)) return { ok: false, reason: 'unknown-file', message: `'${file}' does not exist`, file };
    if (existe(rename)) return invalido(`Cannot rename '${file}' to '${rename}': '${rename}' already exists`, file);
    const otro = renombres.find((r, j) => j !== i && (dentro(r.file, file) || dentro(file, r.file) || r.rename === rename));
    if (otro !== undefined) return invalido(`Renames of '${file}' and '${otro.file}' overlap; apply them one at a time`, file);
  }
  return undefined;
}

/** Applies the checked renames in order; if one fails, undoes the previous ones and rethrows. */
function renombrarTodo(puerto: PuertoDeWorkspace, renombres: readonly Renombrado[]): void {
  const hechos: Renombrado[] = [];
  try {
    for (const r of renombres) {
      puerto.renombrar?.(r.file, r.rename);
      hechos.push(r);
    }
  } catch (error) {
    for (const r of hechos.reverse()) puerto.renombrar?.(r.rename, r.file);
    throw error;
  }
}

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
  let renombrados: Renombrado[] = [];
  if (esListaDeEdiciones(aplicable)) {
    // A `rename` edit renames a path after the text edits are written (their paths are the old ones); its range and
    // replacement are an empty edit, so it takes no part in the text.
    renombrados = aplicable.flatMap((e) => (e.rename === undefined ? [] : [{ file: e.file, rename: e.rename }]));
    const rechazo = renombrados.length === 0 ? undefined : comprobarRenombres(puerto, renombrados);
    if (rechazo !== undefined) return rechazo;
    const ediciones = aplicable.map((e) => ({ ...e, hash: e.hash ?? visto?.[e.file] ?? hashDeContenido(disco[e.file] ?? '') }));
    const deTexto = ediciones.filter((e) => e.rename === undefined);
    const aplicado = deTexto.length === 0 ? { ok: true as const, archivos: disco } : opciones.aunqueNoCompile === true ? reemplazarTexto(disco, deTexto) : aplicarEdiciones(disco, deTexto);
    r = { ...aplicado, ediciones };
  } else {
    r = aplicarIntencion(disco, aplicable, visto);
  }
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message, ...(r.file === undefined ? {} : { file: r.file }) };
  const cambiados = cambiadosEntre(disco, r.archivos);
  const fuera = cambiados.find((f) => !(f in propios));
  if (fuera !== undefined) {
    return { ok: false, reason: 'unknown-file', message: `'${fuera}' does not belong to the Workspace`, file: fuera };
  }
  for (const ruta of cambiados) puerto.escribir(ruta, r.archivos[ruta] as string);
  renombrarTodo(puerto, renombrados);
  return { ok: true, cambiados, ediciones: r.ediciones, renombrados };
}

const esListaDeEdiciones = (aplicable: Aplicable): aplicable is readonly EdicionDeTexto[] => Array.isArray(aplicable);
