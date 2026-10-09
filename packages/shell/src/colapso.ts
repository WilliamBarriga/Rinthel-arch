/**
 * Colapso y expansion de Grupos (ADR 0004): funciones puras sin DOM. Alternar
 * un Grupo cambia el `EstadoDeColapso`; la camara se compensa para que el Grupo
 * tocado no se mueva en pantalla; la geometria vieja y la nueva se interpolan
 * para el morph.
 */
import type { EstadoDeColapso, NodoResuelto, Visibilidad, VistaResuelta } from 'canonico';
import type { CajaDeNodo, Geometria, RutaDeArista } from 'layout';
import type { Camara } from 'render';

/** Tope de Nodos visibles a la vez (ADR 0004: ~1k). */
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

/**
 * Camara tras un cambio de geometria que deja el Grupo en la misma posicion de
 * pantalla: se desplaza lo mismo que se movio la caja absoluta del Grupo. El
 * tamano de la camara (zoom) no cambia.
 */
export function compensarCamara(camara: Camara, antes: CajaDeNodo, despues: CajaDeNodo): Camara {
  return { ...camara, x: camara.x + despues.x - antes.x, y: camara.y + despues.y - antes.y };
}

const mezcla = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mezclarCaja(a: CajaDeNodo, b: CajaDeNodo, t: number): CajaDeNodo {
  return { x: mezcla(a.x, b.x, t), y: mezcla(a.y, b.y, t), width: mezcla(a.width, b.width, t), height: mezcla(a.height, b.height, t) };
}

function mezclarRuta(a: RutaDeArista, b: RutaDeArista, t: number): RutaDeArista {
  if (a.points.length !== b.points.length) return b;
  return { points: b.points.map((p, i) => ({ x: mezcla(a.points[i]!.x, p.x, t), y: mezcla(a.points[i]!.y, p.y, t) })) };
}

/**
 * Geometria intermedia entre `desde` (t = 0) y `hasta` (t = 1). Lo que existe
 * en las dos se interpola; lo que solo existe en `hasta` queda en su sitio final
 * (`visibilidadDeMorph` lo funde); las rutas con distinto numero de puntos saltan
 * a la nueva.
 */
export function interpolarGeometria(desde: Geometria, hasta: Geometria, t: number): Geometria {
  const nodes: Record<string, CajaDeNodo> = {};
  for (const [id, caja] of Object.entries(hasta.nodes)) {
    const previa = desde.nodes[id];
    nodes[id] = previa === undefined ? caja : mezclarCaja(previa, caja, t);
  }
  const edges: Record<string, RutaDeArista> = {};
  for (const [id, ruta] of Object.entries(hasta.edges)) {
    const previa = desde.edges[id];
    edges[id] = previa === undefined ? ruta : mezclarRuta(previa, ruta, t);
  }
  return { ...hasta, nodes, edges, width: mezcla(desde.width, hasta.width, t), height: mezcla(desde.height, hasta.height, t) };
}

/** Visibilidad durante el morph: lo que no estaba en `desde` entra con fundido `t`; el resto manda `base` (o 1). */
export function visibilidadDeMorph(desde: Geometria, hasta: Geometria, t: number, base?: Visibilidad): Visibilidad {
  return (id) => {
    const previa = base?.(id) ?? 1;
    const nuevo = (hasta.nodes[id] !== undefined && desde.nodes[id] === undefined) || (hasta.edges[id] !== undefined && desde.edges[id] === undefined);
    return nuevo ? previa * t : previa;
  };
}
