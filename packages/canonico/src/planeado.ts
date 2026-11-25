/**
 * Effective Planned mark (ADR 0011): the written mark plus the inherited one. A planned Group marks its descendants
 * (and their Attributes); an Edge is planned if it carries the mark or one of its ends (Node or Attribute) is planned;
 * a Message, if its Interaction or one of its Lifelines is. Pure.
 */
import type { Arista, Extremo, Interaccion, Mensaje, Nodo } from './esquema';

/** What is planned in a Model, with inheritance already applied. */
export interface Planeados {
  /** Ids of planned Nodes (marked or under a marked Group). */
  nodos: ReadonlySet<string>;
  /** Planned `node#attribute` keys: the marked ones and all those of a planned Node. */
  atributos: ReadonlySet<string>;
  /** Ids of marked Interactions. */
  interacciones: ReadonlySet<string>;
}

/** Walks the Model once; the queries (`extremoPlaneado`, `aristaPlaneada`, `mensajePlaneado`) are O(1). */
export function planeados(modelo: { nodes: readonly Nodo[]; interactions?: readonly Pick<Interaccion, 'id' | 'planned'>[] }): Planeados {
  const nodos = new Set<string>();
  const atributos = new Set<string>();
  const recorrer = (lista: readonly Nodo[], heredado: boolean): void => {
    for (const nodo of lista) {
      const planeado = heredado || nodo.planned === true;
      if (planeado) nodos.add(nodo.id);
      for (const atributo of nodo.attributes) if (planeado || atributo.planned === true) atributos.add(`${nodo.id}#${atributo.name}`);
      recorrer(nodo.children, planeado);
    }
  };
  recorrer(modelo.nodes, false);
  const interacciones = new Set((modelo.interactions ?? []).filter((i) => i.planned === true).map((i) => i.id));
  return { nodos, atributos, interacciones };
}

/** Whether an Edge end (Node or `node#attribute`) is planned. */
export function extremoPlaneado(extremo: Extremo, p: Planeados): boolean {
  return p.nodos.has(extremo.node) || (extremo.attribute !== undefined && p.atributos.has(`${extremo.node}#${extremo.attribute}`));
}

/** Whether the Model Edge is drawn planned: marked or with a planned end. */
export function aristaPlaneada(arista: Pick<Arista, 'from' | 'to' | 'planned'>, p: Planeados): boolean {
  return arista.planned === true || extremoPlaneado(arista.from, p) || extremoPlaneado(arista.to, p);
}

/** Whether the Message (with its Model ends, before lifting) of Interaction `interaccion` is drawn planned. */
export function mensajePlaneado(mensaje: Pick<Mensaje, 'from' | 'to'>, interaccion: string, p: Planeados): boolean {
  return p.interacciones.has(interaccion) || p.nodos.has(mensaje.from) || p.nodos.has(mensaje.to);
}
