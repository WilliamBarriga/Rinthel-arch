/** Recorte de una Vista resuelta a lo que cae en la camara; puro. Las cajas se comparan en coordenadas del lienzo. */
import { edgeId } from 'canonical';
import type { ResolvedEdge, NodeBox, Geometry, ResolvedNode, ResolvedView } from 'canonical';
import { indiceDeGeometria } from 'layout';
import type { Camara } from 'render';

/** Cruce con borde incluido, para que una ruta recta (alto o ancho 0) cuente. */
function cruzan(caja: NodeBox, camara: Camara): boolean {
  return (
    caja.x <= camara.x + camara.width &&
    caja.x + caja.width >= camara.x &&
    caja.y <= camara.y + camara.height &&
    caja.y + caja.height >= camara.y
  );
}

/** En secuencia una Lifeline ocupa su columna entera (cabecera, linea y activaciones): si la camara ve la linea, la Lifeline se dibuja aunque su cabecera quede fuera. */
function extension(geometria: Geometry, id: string, caja: NodeBox): NodeBox {
  const linea = geometria.kind === 'secuencia' ? geometria.lifelines[id] : undefined;
  return linea === undefined ? caja : { ...caja, height: Math.max(caja.height, linea.y2 - caja.y) };
}

/**
 * Deja solo los Nodos cuya caja cruza la camara y las Aristas cuya ruta cruza
 * la camara. Un Grupo visible conserva solo los hijos visibles. Un Nodo sin caja
 * en la geometria se conserva para que `render` avise del error de uso.
 */
export function recortarAlViewport(vista: ResolvedView, geometria: Geometry, camara: Camara): ResolvedView {
  const { cajas } = indiceDeGeometria(vista, geometria);
  const dentro = new Set<string>();
  for (const nodo of vista.nodes) {
    const caja = cajas.get(nodo.id);
    if (caja === undefined || cruzan(extension(geometria, nodo.id, caja), camara)) dentro.add(nodo.id);
  }
  const podar = (nodo: ResolvedNode): ResolvedNode => ({
    ...nodo,
    children: nodo.children.filter((hijo) => dentro.has(hijo.id)).map(podar),
  });
  const nodes = vista.nodes.filter((nodo) => dentro.has(nodo.id)).map(podar);
  switch (vista.type) {
    case 'sequence':
      return { ...vista, nodes };
    case 'architecture':
    case 'flow':
    case 'er':
      return { ...vista, nodes, edges: aristasEnLaCamara(vista.edges, geometria, camara) };
  }
}

/** Aristas cuya ruta cruza la camara (una sin ruta en la geometria se descarta). */
function aristasEnLaCamara(aristas: readonly ResolvedEdge[], geometria: Geometry, camara: Camara): ResolvedEdge[] {
  return aristas.filter((arista) => {
    const puntos = (geometria.kind === 'grafo' ? geometria.edges[edgeId(arista)]?.points : undefined) ?? [];
    if (puntos.length === 0) return false;
    const xs = puntos.map((p) => p.x);
    const ys = puntos.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return cruzan({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, camara);
  });
}
