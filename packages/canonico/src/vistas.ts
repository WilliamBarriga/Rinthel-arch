/**
 * Resolucion de Vistas: que Nodos y Aristas muestra una Vista del Modelo.
 * Pura: no modifica la Fuente. Una Vista solo selecciona, nunca define entidades.
 */
import type { Arista, FuenteCanonica, Nodo } from './esquema';

/** Nodos y Aristas visibles de una Vista. */
export interface VistaResuelta {
  /** Nodos visibles en orden de documento; sus `children` son solo los visibles. */
  nodes: Nodo[];
  /** Aristas con ambos extremos visibles. */
  edges: Arista[];
}

/**
 * Resuelve la Vista `viewId`: `include` (`a` un Nodo, `a.*` hijos directos,
 * `a.**` descendientes, `*` raices, `**` todo), menos `exclude`, limitado a
 * `depth` niveles de anidacion (las raices son el nivel 1). Devuelve
 * `undefined` si la Vista no existe. Los selectores que no coinciden con ningun
 * Nodo no dan error, y `exclude` no arrastra a los descendientes del Nodo excluido.
 * Aun sin parametro de estado de colapso: llega con el ticket #33.
 */
export function resolveView(fuente: FuenteCanonica, viewId: string): VistaResuelta | undefined {
  const vista = fuente.views.find((candidata) => candidata.id === viewId);
  if (vista === undefined) return undefined;

  const todos = aplanar(fuente.model.nodes);
  const seleccionados = (selectores: readonly string[]): Set<string> =>
    new Set(todos.filter((nodo) => selectores.some((selector) => coincide(selector, nodo.id))).map((nodo) => nodo.id));
  const incluidos = seleccionados(vista.include);
  const excluidos = seleccionados(vista.exclude);

  const visibles = new Set(
    todos
      .map((nodo) => nodo.id)
      .filter(
        (id) =>
          incluidos.has(id) && !excluidos.has(id) && (vista.depth === undefined || nivel(id) <= vista.depth),
      ),
  );
  return {
    nodes: todos.filter((nodo) => visibles.has(nodo.id)).map((nodo) => podar(nodo, visibles)),
    edges: fuente.model.edges.filter(({ from, to }) => visibles.has(from.node) && visibles.has(to.node)),
  };
}

/** Todos los Nodos a cualquier profundidad, en orden de documento. */
function aplanar(nodos: readonly Nodo[]): Nodo[] {
  return nodos.flatMap((nodo) => [nodo, ...aplanar(nodo.children)]);
}

function nivel(id: string): number {
  return id.split('.').length;
}

/** Copia del Nodo cuyos `children` (a cualquier profundidad) son solo los visibles. */
function podar(nodo: Nodo, visibles: ReadonlySet<string>): Nodo {
  return {
    ...nodo,
    children: nodo.children.filter((hijo) => visibles.has(hijo.id)).map((hijo) => podar(hijo, visibles)),
  };
}

/** Si el id cae dentro de lo que designa el selector. */
function coincide(selector: string, id: string): boolean {
  if (selector === '**') return true;
  if (selector === '*') return nivel(id) === 1;
  if (selector.endsWith('.**')) return id.startsWith(selector.slice(0, -2));
  if (selector.endsWith('.*')) {
    const prefijo = selector.slice(0, -1);
    return id.startsWith(prefijo) && nivel(id) === nivel(selector);
  }
  return id === selector;
}
