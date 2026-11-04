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

/** Resultado de `aplicarIntencion`: los `archivos` nuevos y las `ediciones` aplicadas, o el rechazo. */
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

/** Pila inmutable de deshacer/rehacer sobre el texto del Workspace: `archivos` es el vigente; `deshacer` restaura el DSL exactamente. */
export interface Historial {
  readonly archivos: ArchivosDelWorkspace;
  readonly pasado: readonly ArchivosDelWorkspace[];
  readonly futuro: readonly ArchivosDelWorkspace[];
}

/** Historial vacio sobre `archivos`: sin pasado ni futuro. */
export const crearHistorial = (archivos: ArchivosDelWorkspace): Historial => ({ archivos, pasado: [], futuro: [] });

/**
 * Registra `archivos` como el nuevo texto vigente cuando el llamador ya lo escribio por su cuenta (el anterior
 * pasa al pasado) y descarta el futuro. Pura; no comprueba que `archivos` difiera del vigente: evitar
 * entradas repetidas es del llamador.
 */
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
