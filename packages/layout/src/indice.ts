/**
 * Indice de geometria absoluta: la unica respuesta a "donde cae cada Nodo en el
 * lienzo, quien es su padre y cuales son las raices". Puro, sin DOM.
 */
import type { NodoResuelto, VistaResuelta } from 'canonico';

import type { CajaDeNodo } from './layout';

export interface IndiceDeGeometria {
  /** Caja de cada Nodo con caja en la geometria, en coordenadas del lienzo. */
  cajas: Map<string, CajaDeNodo>;
  /** Id del Grupo que anida a cada Nodo anidado (las raices no estan). */
  padre: Map<string, string>;
  /** Nodos de primer nivel: los que ningun Grupo de la Vista anida. */
  raices: NodoResuelto[];
}

/**
 * `resolveView` lista todos los Nodos visibles a plano y anida ademas los hijos;
 * las `cajas` de la geometria son relativas al Grupo padre y aqui se pasan al
 * lienzo. Un Nodo sin caja se omite (y con el su subarbol). Un Grupo colapsado
 * no tiene hijos en la Vista, asi que es una hoja.
 */
export function indiceDeGeometria(vista: VistaResuelta, geometria: { nodes: Readonly<Record<string, CajaDeNodo>> }): IndiceDeGeometria {
  const padre = new Map(vista.nodes.flatMap((nodo) => nodo.children.map((hijo) => [hijo.id, nodo.id] as const)));
  const raices = vista.nodes.filter((nodo) => !padre.has(nodo.id));
  const cajas = new Map<string, CajaDeNodo>();
  const visitar = (nodo: NodoResuelto, dx: number, dy: number): void => {
    const caja = geometria.nodes[nodo.id];
    if (caja === undefined) return;
    const absoluta = { ...caja, x: caja.x + dx, y: caja.y + dy };
    cajas.set(nodo.id, absoluta);
    for (const hijo of nodo.children) visitar(hijo, absoluta.x, absoluta.y);
  };
  for (const raiz of raices) visitar(raiz, 0, 0);
  return { cajas, padre, raices };
}
