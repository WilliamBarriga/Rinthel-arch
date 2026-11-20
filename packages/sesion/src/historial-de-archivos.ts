/**
 * Historial de deshacer de `dev` por archivo (ADR 0007, "Historial ante escrituras externas"): cada entrada guarda el
 * texto antes y despues de cada archivo que cambio. Deshacer o rehacer escribe solo esos archivos y se rechaza con
 * `hash-desactualizado` si alguno cambio por fuera (la regla de `visto`); una escritura externa en otro archivo no lo
 * invalida ni lo reinicia. Puro e inmutable: quien lo usa escribe `escritos` en el disco.
 */
import type { ArchivosDelWorkspace } from 'dsl';

/** `undefined`: el archivo no existia (antes) o se borro (despues). */
export interface CambioDeArchivo {
  readonly antes: string | undefined;
  readonly despues: string | undefined;
}

export interface EntradaDelHistorial {
  /** La arma quien registra: segun la Intencion, la `descripcion` de la peticion o "texto de `<archivo>`". */
  readonly descripcion: string;
  readonly cambios: Readonly<Record<string, CambioDeArchivo>>;
}

/** `pasado` de la mas vieja a la mas reciente; `futuro` empieza por la siguiente a rehacer. */
export interface HistorialDeArchivos {
  readonly pasado: readonly EntradaDelHistorial[];
  readonly futuro: readonly EntradaDelHistorial[];
}

export const historialVacio: HistorialDeArchivos = { pasado: [], futuro: [] };

export type ResultadoDeRestaurar =
  | { ok: true; historial: HistorialDeArchivos; archivos: ArchivosDelWorkspace; escritos: string[] }
  | { ok: false; motivo: 'nada-que-deshacer' | 'nada-que-rehacer' | 'hash-desactualizado'; mensaje: string; file?: string };

/** Apila lo que cambio de `antes` a `despues` y descarta el futuro; sin cambios devuelve el mismo historial. */
export function registrar(historial: HistorialDeArchivos, descripcion: string, antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace): HistorialDeArchivos {
  const rutas = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((r) => antes[r] !== despues[r]).sort();
  if (rutas.length === 0) return historial;
  const cambios = Object.fromEntries(rutas.map((r) => [r, { antes: antes[r], despues: despues[r] }]));
  return { pasado: [...historial.pasado, { descripcion, cambios }], futuro: [] };
}

/** Lleva cada archivo de la entrada de `desde` a `hacia`, si el disco sigue en `desde`. */
function mover(entrada: EntradaDelHistorial, disco: ArchivosDelWorkspace, sentido: 'deshacer' | 'rehacer'): { ok: true; archivos: ArchivosDelWorkspace; escritos: string[] } | { ok: false; file: string } {
  const archivos: Record<string, string> = { ...disco };
  const escritos = Object.keys(entrada.cambios).sort();
  for (const ruta of escritos) {
    const cambio = entrada.cambios[ruta] as CambioDeArchivo;
    const [desde, hacia] = sentido === 'deshacer' ? [cambio.despues, cambio.antes] : [cambio.antes, cambio.despues];
    if (disco[ruta] !== desde) return { ok: false, file: ruta };
    if (hacia === undefined) delete archivos[ruta];
    else archivos[ruta] = hacia;
  }
  return { ok: true, archivos, escritos };
}

const fuera = (file: string) => ({ ok: false, motivo: 'hash-desactualizado', mensaje: `'${file}' cambio fuera de dev; no se puede restaurar esta entrada`, file }) as const;

export function deshacerSobre(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace): ResultadoDeRestaurar {
  const entrada = historial.pasado[historial.pasado.length - 1];
  if (entrada === undefined) return { ok: false, motivo: 'nada-que-deshacer', mensaje: 'Nada que deshacer' };
  const r = mover(entrada, disco, 'deshacer');
  if (!r.ok) return fuera(r.file);
  return { ...r, historial: { pasado: historial.pasado.slice(0, -1), futuro: [entrada, ...historial.futuro] } };
}

export function rehacerSobre(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace): ResultadoDeRestaurar {
  const [entrada, ...resto] = historial.futuro;
  if (entrada === undefined) return { ok: false, motivo: 'nada-que-rehacer', mensaje: 'Nada que rehacer' };
  const r = mover(entrada, disco, 'rehacer');
  if (!r.ok) return fuera(r.file);
  return { ...r, historial: { pasado: [...historial.pasado, entrada], futuro: resto } };
}
