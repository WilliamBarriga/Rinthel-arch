import type { Intencion, Issue } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
import { fijarTema, moverPin, ordenarLifelines } from './gestos';
import type { ResultadoDeGesto, Visto } from './gestos';

export type { Intencion };
export type { Visto };

export type ResultadoDeIntencion = ResultadoDeGesto;

/**
 * Reductor puro: mapa nuevo o rechazo con `reason`. `visto` rechaza con `stale-hash` si el archivo que
 * cambia difiere; sin `visto` aplica sobre el vigente. No escribe.
 */
export function aplicarIntencion(archivos: ArchivosDelWorkspace, intencion: Intencion, visto?: Visto): ResultadoDeIntencion {
  switch (intencion.type) {
    case 'move-pin': {
      const { type: _tipo, ...pin } = intencion;
      return moverPin(archivos, pin, visto);
    }
    case 'reorder-lifelines': {
      const { type: _tipo, ...orden } = intencion;
      return ordenarLifelines(archivos, orden, visto);
    }
    case 'set-theme': {
      const { type: _tipo, ...tema } = intencion;
      return fijarTema(archivos, tema, visto);
    }
  }
}

/** Pila inmutable de deshacer/rehacer sobre el texto del Workspace; `archivos` es el vigente. */
export interface Historial {
  readonly archivos: ArchivosDelWorkspace;
  readonly pasado: readonly ArchivosDelWorkspace[];
  readonly futuro: readonly ArchivosDelWorkspace[];
}

export const crearHistorial = (archivos: ArchivosDelWorkspace): Historial => ({ archivos, pasado: [], futuro: [] });

/** Registra `archivos` como vigente y descarta el futuro. No comprueba que difiera del vigente. */
export const apilar = (historial: Historial, archivos: ArchivosDelWorkspace): Historial => ({
  archivos,
  pasado: [...historial.pasado, historial.archivos],
  futuro: [],
});

/** Aplica una Intencion y la apila; descarta el futuro. Un rechazo no altera el historial. */
export function editarEnHistorial(
  historial: Historial,
  intencion: Intencion,
): ResultadoDeEdicion<{ historial: Historial; ediciones: EdicionConHash[]; issues: Issue[] }> {
  const r = aplicarIntencion(historial.archivos, intencion);
  if (!r.ok) return r;
  return {
    ok: true,
    historial: apilar(historial, r.archivos),
    ediciones: r.ediciones,
    issues: r.issues,
  };
}

/** Restaura el texto anterior exactamente; `undefined` si no hay nada que deshacer. */
export function deshacer(historial: Historial): Historial | undefined {
  const anterior = historial.pasado[historial.pasado.length - 1];
  if (anterior === undefined) return undefined;
  return {
    archivos: anterior,
    pasado: historial.pasado.slice(0, -1),
    futuro: [historial.archivos, ...historial.futuro],
  };
}

/** Reaplica la ultima edicion deshecha; `undefined` si no hay nada que rehacer. */
export function rehacer(historial: Historial): Historial | undefined {
  const [siguiente, ...resto] = historial.futuro;
  if (siguiente === undefined) return undefined;
  return { archivos: siguiente, pasado: [...historial.pasado, historial.archivos], futuro: resto };
}
