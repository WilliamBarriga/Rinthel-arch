/** Colapso y expansion de Grupos: funciones puras sin DOM. */
import type { CollapseState, ResolvedNode, ResolvedView } from 'canonical';

export const MAX_NODOS_VISIBLES = 1000;

export function buscarNodo(vista: ResolvedView, id: string): ResolvedNode | undefined {
  const buscar = (nodos: readonly ResolvedNode[]): ResolvedNode | undefined => {
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
export function contarNodosVisibles(vista: ResolvedView): number {
  const contar = (nodos: readonly ResolvedNode[]): number => nodos.reduce((suma, n) => suma + 1 + contar(n.children), 0);
  return contar(vista.nodes);
}

/**
 * Estado que resulta de alternar el Grupo `id`: un Grupo cerrado se abre y uno
 * abierto se cierra. `undefined` si no es alternable (no existe en la Vista, no
 * es Grupo o tiene `link`). No muta `estado`.
 */
export function alternarGrupo(estado: CollapseState, vista: ResolvedView, id: string): CollapseState | undefined {
  const nodo = buscarNodo(vista, id);
  if (nodo === undefined || nodo.childCount === 0 || nodo.link !== undefined) return undefined;
  const sin = (lista: readonly string[] | undefined): string[] => (lista ?? []).filter((x) => x !== id);
  return nodo.collapsed
    ? { expanded: [...sin(estado.expanded), id], collapsed: sin(estado.collapsed) }
    : { expanded: sin(estado.expanded), collapsed: [...sin(estado.collapsed), id] };
}
