/**
 * Marca Planeado efectiva (ADR 0011): la escrita mas la heredada. Un Grupo planeado marca a sus descendientes (y a
 * sus Atributos); una Arista lo esta si lleva la marca o si un extremo (Nodo o Atributo) lo esta; un Mensaje, si su
 * Interaccion o una de sus Lifelines lo esta. Puro.
 */
import type { Arista, Extremo, Interaccion, Mensaje, Nodo } from './esquema';

/** Lo planeado de un Modelo, con la herencia ya aplicada. */
export interface Planeados {
  /** Ids de Nodo planeados (marcados o bajo un Grupo marcado). */
  nodos: ReadonlySet<string>;
  /** `nodo#atributo` planeados: los marcados y todos los de un Nodo planeado. */
  atributos: ReadonlySet<string>;
  /** Ids de Interaccion marcadas. */
  interacciones: ReadonlySet<string>;
}

/** Recorre el Modelo una vez; las consultas (`extremoPlaneado`, `aristaPlaneada`, `mensajePlaneado`) son O(1). */
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

/** Un extremo de Arista (Nodo o `nodo#atributo`) planeado. */
export function extremoPlaneado(extremo: Extremo, p: Planeados): boolean {
  return p.nodos.has(extremo.node) || (extremo.attribute !== undefined && p.atributos.has(`${extremo.node}#${extremo.attribute}`));
}

/** La Arista del Modelo se dibuja planeada: marcada o con un extremo planeado. */
export function aristaPlaneada(arista: Pick<Arista, 'from' | 'to' | 'planned'>, p: Planeados): boolean {
  return arista.planned === true || extremoPlaneado(arista.from, p) || extremoPlaneado(arista.to, p);
}

/** El Mensaje (con sus extremos del Modelo, antes de elevarlos) de la Interaccion `interaccion` se dibuja planeado. */
export function mensajePlaneado(mensaje: Pick<Mensaje, 'from' | 'to'>, interaccion: string, p: Planeados): boolean {
  return p.interacciones.has(interaccion) || p.nodos.has(mensaje.from) || p.nodos.has(mensaje.to);
}
