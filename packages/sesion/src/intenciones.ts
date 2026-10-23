import type { Intencion, Issue } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { editarPin } from './ediciones';
import type { EdicionConHash, ResultadoDeEdicion } from './ediciones';

/**
 * Intencion de edicion: union discriminada por `tipo`, declarada en `canonico`
 * (`intencionSchema`). Cada herramienta nueva es una variante mas alla, con su rama
 * en `aplicarIntencion`. Hoy solo existe mover un Pin.
 */
export type { Intencion };

export type ResultadoDeIntencion = ResultadoDeEdicion<{
  archivos: ArchivosDelWorkspace;
  ediciones: EdicionConHash[];
  issues: Issue[];
}>;

/** Reductor puro: Intencion sobre el mapa de archivos -> mapa nuevo o rechazo con `motivo`. */
export function aplicarIntencion(archivos: ArchivosDelWorkspace, intencion: Intencion): ResultadoDeIntencion {
  switch (intencion.tipo) {
    case 'mover-pin': {
      const { tipo: _tipo, ...pin } = intencion;
      return editarPin(archivos, pin);
    }
  }
}

/** Estado inmutable de deshacer/rehacer sobre el texto del Workspace: `archivos` es el vigente. */
export interface Historial {
  readonly archivos: ArchivosDelWorkspace;
  readonly pasado: readonly ArchivosDelWorkspace[];
  readonly futuro: readonly ArchivosDelWorkspace[];
}

export const crearHistorial = (archivos: ArchivosDelWorkspace): Historial => ({ archivos, pasado: [], futuro: [] });

/** Aplica una Intencion y la apila; descarta el futuro. Un rechazo no altera el historial. */
export function editarEnHistorial(
  historial: Historial,
  intencion: Intencion,
): ResultadoDeEdicion<{ historial: Historial; ediciones: EdicionConHash[]; issues: Issue[] }> {
  const r = aplicarIntencion(historial.archivos, intencion);
  if (!r.ok) return r;
  return {
    ok: true,
    historial: { archivos: r.archivos, pasado: [...historial.pasado, historial.archivos], futuro: [] },
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
