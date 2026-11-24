/**
 * Historial de deshacer de `dev` por archivo (ADR 0007, "Historial ante escrituras externas"): cada entrada guarda el
 * texto antes y despues de cada archivo que cambio. Deshacer o rehacer escribe solo esos archivos y se rechaza con
 * `stale-hash` si alguno cambio por fuera (la regla de `visto`); una escritura externa en otro archivo no lo
 * invalida ni lo reinicia. Puro e inmutable: quien lo usa escribe `escritos` en el disco.
 * Saltar (#193): `saltar` lleva el disco a cualquier entrada (o a `INICIO_DEL_HISTORIAL_DE_DEV`) componiendo deshacer o rehacer
 * con la misma regla de rechazo; no apila y conserva el futuro. Cada entrada lleva un `id` creciente que no se reutiliza.
 */
import { INICIO_DEL_HISTORIAL_DE_DEV } from 'canonico';
import type { EntradaDelHistorialDeDev, HistorialDeDev, Intencion } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

/** `undefined`: el archivo no existia (antes) o se borro (despues). */
export interface CambioDeArchivo {
  readonly antes: string | undefined;
  readonly despues: string | undefined;
}

export interface EntradaDelHistorial {
  /** Contador estable mientras viva el Historial (el proceso de `dev`); empieza en 1. */
  readonly id: number;
  /** Momento del registro en ms (lo pone quien registra: `sesion` no tiene reloj). */
  readonly cuando: number;
  /** La arma quien registra: segun la Intencion, la `descripcion` de la peticion o "texto de `<archivo>`". */
  readonly descripcion: string;
  readonly cambios: Readonly<Record<string, CambioDeArchivo>>;
}

/** `pasado` de la mas vieja a la mas reciente; `futuro` empieza por la siguiente a rehacer. */
export interface HistorialDeArchivos {
  readonly pasado: readonly EntradaDelHistorial[];
  readonly futuro: readonly EntradaDelHistorial[];
  /** `id` de la proxima entrada. */
  readonly siguiente: number;
}

export const historialVacio: HistorialDeArchivos = { pasado: [], futuro: [], siguiente: 1 };


export type ResultadoDeRestaurar =
  | { ok: true; historial: HistorialDeArchivos; archivos: ArchivosDelWorkspace; escritos: string[] }
  | { ok: false; motivo: 'nothing-to-undo' | 'nothing-to-redo' | 'stale-hash' | 'unknown-entry'; mensaje: string; file?: string };

/** Descripcion de la entrada de una Intencion. */
export function descripcionDeIntencion(intencion: Intencion): string {
  switch (intencion.tipo) {
    case 'move-pin':
      return `move ${intencion.nodo} in ${intencion.vista}`;
    case 'reorder-lifelines':
      return `reorder Lifelines of ${intencion.vista}`;
    case 'set-theme':
      return intencion.tema === undefined ? `unpin the Theme of ${intencion.vista}` : `pin the Theme ${intencion.tema} to ${intencion.vista}`;
  }
}

/** Descripcion de un guardado de texto sin `descripcion` propia. */
export const descripcionDeTexto = (archivos: readonly string[]): string => `text of ${archivos.join(', ')}`;

const rutasCambiadas = (antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace): string[] =>
  [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((r) => antes[r] !== despues[r]).sort();

/** Apila lo que cambio de `antes` a `despues` y descarta el futuro; sin cambios devuelve el mismo historial. */
export function registrar(historial: HistorialDeArchivos, descripcion: string, antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace, cuando = 0): HistorialDeArchivos {
  const rutas = rutasCambiadas(antes, despues);
  if (rutas.length === 0) return historial;
  const cambios = Object.fromEntries(rutas.map((r) => [r, { antes: antes[r], despues: despues[r] }]));
  return { pasado: [...historial.pasado, { id: historial.siguiente, cuando, descripcion, cambios }], futuro: [], siguiente: historial.siguiente + 1 };
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

const fuera = (file: string) => ({ ok: false, motivo: 'stale-hash', mensaje: `'${file}' changed outside dev; this entry cannot be restored`, file }) as const;

export function deshacerSobre(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace): ResultadoDeRestaurar {
  const entrada = historial.pasado[historial.pasado.length - 1];
  if (entrada === undefined) return { ok: false, motivo: 'nothing-to-undo', mensaje: 'Nothing to undo' };
  const r = mover(entrada, disco, 'deshacer');
  if (!r.ok) return fuera(r.file);
  return { ...r, historial: { ...historial, pasado: historial.pasado.slice(0, -1), futuro: [entrada, ...historial.futuro] } };
}

export function rehacerSobre(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace): ResultadoDeRestaurar {
  const [entrada, ...resto] = historial.futuro;
  if (entrada === undefined) return { ok: false, motivo: 'nothing-to-redo', mensaje: 'Nothing to redo' };
  const r = mover(entrada, disco, 'rehacer');
  if (!r.ok) return fuera(r.file);
  return { ...r, historial: { ...historial, pasado: [...historial.pasado, entrada], futuro: resto } };
}

/**
 * Lleva el disco a la entrada `id`: del pasado, al estado justo despues de ella; del futuro, rehaciendo hasta ella;
 * `INICIO_DEL_HISTORIAL_DE_DEV`, al texto previo a la primera. `escritos` son solo los archivos que difieren del disco.
 */
export function saltar(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace, id: number): ResultadoDeRestaurar {
  const haciaAtras = id === INICIO_DEL_HISTORIAL_DE_DEV || historial.pasado.some((e) => e.id === id);
  if (!haciaAtras && !historial.futuro.some((e) => e.id === id)) return { ok: false, motivo: 'unknown-entry', mensaje: `There is no entry ${id} in the History` };
  const llego = (h: HistorialDeArchivos): boolean => (id === INICIO_DEL_HISTORIAL_DE_DEV ? h.pasado.length === 0 : h.pasado[h.pasado.length - 1]?.id === id);
  let h = historial;
  let archivos = disco;
  while (!llego(h)) {
    const r = haciaAtras ? deshacerSobre(h, archivos) : rehacerSobre(h, archivos);
    if (!r.ok) return r;
    h = r.historial;
    archivos = r.archivos;
  }
  return { ok: true, historial: h, archivos, escritos: rutasCambiadas(disco, archivos) };
}

/**
 * El Historial tal como lo ve la UI (`HistorialDeDev` de `canonico`): cada destino es alcanzable si `saltar` a el no se
 * rechaza sobre `disco` (la regla de deshacer); `motivo` solo si no lo es.
 */
export function historialVisible(historial: HistorialDeArchivos, disco: ArchivosDelWorkspace): HistorialDeDev {
  const alcance = (id: number): HistorialDeDev['inicio'] => {
    const r = saltar(historial, disco, id);
    return r.ok ? { alcanzable: true } : { alcanzable: false, motivo: r.mensaje };
  };
  const visible = ({ id, descripcion, cuando, cambios }: EntradaDelHistorial): EntradaDelHistorialDeDev => ({ id, descripcion, archivos: Object.keys(cambios), cuando, ...alcance(id) });
  return { pasado: historial.pasado.map(visible), futuro: historial.futuro.map(visible), inicio: alcance(INICIO_DEL_HISTORIAL_DE_DEV) };
}
