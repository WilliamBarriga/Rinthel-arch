/** Indice de geometria absoluta: caja de cada Nodo en el lienzo, su padre y las raices. Puro. */
import type { CajaDeNodo, NodoResuelto, VistaResuelta } from 'canonico';


export interface IndiceDeGeometria {
  /** Caja de cada Nodo con caja en la geometria, en coordenadas del lienzo. */
  cajas: Map<string, CajaDeNodo>;
  /** Las raices no estan. */
  padre: Map<string, string>;
  /** Los Nodos que ningun Grupo de la Vista anida. */
  raices: NodoResuelto[];
}

/** Un Nodo sin caja se omite junto con su subarbol; un Grupo colapsado es una hoja. */
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
