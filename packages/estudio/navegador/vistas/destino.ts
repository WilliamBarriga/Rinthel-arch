/**
 * Que Vista muestra un Nodo, sin DOM: lo comparten "seguir al agente", el Buscador y la Diferencia.
 * Invariantes: "muestra" es que la Vista resuelta (sin colapso) contiene el Nodo; el orden es el de declaracion.
 */
import { resolveView } from 'canonico';
import type { FuenteCanonica } from 'canonico';

interface ConHijos {
  id: string;
  children: readonly ConHijos[];
}

const incluye = (nodos: readonly ConHijos[], id: string): boolean => nodos.some((n) => n.id === id || incluye(n.children, id));

/** Si la Vista `vista` muestra el Nodo `nodo`. */
export function vistaMuestra(fuente: FuenteCanonica, vista: string, nodo: string): boolean {
  const resuelta = resolveView(fuente, vista);
  return resuelta !== undefined && incluye(resuelta.nodes, nodo);
}

/** Vistas que muestran el Nodo, en orden de declaracion. */
export const vistasQueMuestran = (fuente: FuenteCanonica, nodo: string): string[] => fuente.views.filter((v) => vistaMuestra(fuente, v.id, nodo)).map((v) => v.id);

export interface DestinoDeNodo {
  vista: string;
  /** Nodo a seleccionar en `vista`. */
  seleccion: string;
}

/** La Vista activa si muestra el Nodo; si no, la primera que lo muestre. `undefined` si ninguna lo muestra. */
export function destinoDeNodo(fuente: FuenteCanonica, nodo: string, vistaActiva: string | undefined): DestinoDeNodo | undefined {
  if (vistaActiva !== undefined && vistaMuestra(fuente, vistaActiva, nodo)) return { vista: vistaActiva, seleccion: nodo };
  const primera = fuente.views.find((v) => vistaMuestra(fuente, v.id, nodo));
  return primera === undefined ? undefined : { vista: primera.id, seleccion: nodo };
}
