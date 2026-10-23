/**
 * Colapso y expansion de Grupos (ADR 0003): funciones puras sin DOM. Alternar
 * un Grupo cambia el `EstadoDeColapso`. La camara vive en `camara.ts` y la
 * animacion en `morph.ts`.
 */
import type { EstadoDeColapso, NodoResuelto, VistaResuelta } from 'canonico';

/** Tope de Nodos visibles a la vez (ADR 0003: ~1k). */
export const MAX_NODOS_VISIBLES = 1000;

export function buscarNodo(vista: VistaResuelta, id: string): NodoResuelto | undefined {
  const buscar = (nodos: readonly NodoResuelto[]): NodoResuelto | undefined => {
    for (const nodo of nodos) {
      if (nodo.id === id) return nodo;
      const hallado = buscar(nodo.children);
      if (hallado !== undefined) return hallado;
    }
    return undefined;
  };
  return buscar(vista.nodes);
}

/** Cuenta los Nodos visibles de la Vista, anidados incluidos. */
export function contarNodosVisibles(vista: VistaResuelta): number {
  const contar = (nodos: readonly NodoResuelto[]): number => nodos.reduce((suma, n) => suma + 1 + contar(n.children), 0);
  return contar(vista.nodes);
}

/**
 * Estado que resulta de alternar el Grupo `id`: un Grupo cerrado se abre y uno
 * abierto se cierra. `undefined` si no es alternable (no existe en la Vista, no
 * es Grupo o tiene `link`). No muta `estado`.
 */
export function alternarGrupo(estado: EstadoDeColapso, vista: VistaResuelta, id: string): EstadoDeColapso | undefined {
  const nodo = buscarNodo(vista, id);
  if (nodo === undefined || nodo.childCount === 0 || nodo.link !== undefined) return undefined;
  const sin = (lista: readonly string[] | undefined): string[] => (lista ?? []).filter((x) => x !== id);
  return nodo.collapsed
    ? { expanded: [...sin(estado.expanded), id], collapsed: sin(estado.collapsed) }
    : { expanded: sin(estado.expanded), collapsed: [...sin(estado.collapsed), id] };
}
