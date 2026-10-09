/**
 * Filtrado por viewport: recorta una Vista resuelta a lo que cae dentro de la
 * camara. Puro, sin DOM. Las cajas de la geometria son relativas al Grupo
 * padre; aqui se pasan a coordenadas del lienzo para compararlas con la camara.
 */
import { idDeArista } from 'canonico';
import type { NodoResuelto, VistaResuelta } from 'canonico';
import type { CajaDeNodo, Geometria } from 'layout';
import type { Camara } from 'render';

/** Cruce con borde incluido, para que una ruta recta (alto o ancho 0) cuente. */
function cruzan(caja: CajaDeNodo, camara: Camara): boolean {
  return (
    caja.x <= camara.x + camara.width &&
    caja.x + caja.width >= camara.x &&
    caja.y <= camara.y + camara.height &&
    caja.y + caja.height >= camara.y
  );
}

/** Cajas de todos los Nodos de la Vista en coordenadas del lienzo. */
export function cajasAbsolutas(vista: VistaResuelta, geometria: Geometria): Map<string, CajaDeNodo> {
  const cajas = new Map<string, CajaDeNodo>();
  const anidados = new Set(vista.nodes.flatMap((nodo) => nodo.children.map((hijo) => hijo.id)));
  const visitar = (nodo: NodoResuelto, dx: number, dy: number): void => {
    const caja = geometria.nodes[nodo.id];
    if (caja === undefined) return;
    const absoluta = { ...caja, x: caja.x + dx, y: caja.y + dy };
    cajas.set(nodo.id, absoluta);
    for (const hijo of nodo.children) visitar(hijo, absoluta.x, absoluta.y);
  };
  for (const raiz of vista.nodes.filter((nodo) => !anidados.has(nodo.id))) visitar(raiz, 0, 0);
  return cajas;
}

/**
 * Deja solo los Nodos cuya caja cruza la camara y las Aristas cuya ruta cruza
 * la camara. Un Grupo visible conserva solo los hijos visibles. Un Nodo sin caja
 * en la geometria se conserva para que `render` avise del error de uso.
 */
export function recortarAlViewport(vista: VistaResuelta, geometria: Geometria, camara: Camara): VistaResuelta {
  const cajas = cajasAbsolutas(vista, geometria);
  const dentro = new Set<string>();
  for (const nodo of vista.nodes) {
    const caja = cajas.get(nodo.id);
    if (caja === undefined || cruzan(caja, camara)) dentro.add(nodo.id);
  }
  const podar = (nodo: NodoResuelto): NodoResuelto => ({
    ...nodo,
    children: nodo.children.filter((hijo) => dentro.has(hijo.id)).map(podar),
  });
  return {
    ...vista,
    nodes: vista.nodes.filter((nodo) => dentro.has(nodo.id)).map(podar),
    edges: vista.edges.filter((arista) => {
      const puntos = geometria.edges[idDeArista(arista)]?.points ?? [];
      if (puntos.length === 0) return false;
      const xs = puntos.map((p) => p.x);
      const ys = puntos.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return cruzan({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, camara);
    }),
  };
}
