/**
 * Ruta y foco de teclado: puro, sin DOM. El shell calcula aqui los estados
 * `en-ruta`, `atenuado` y `foco` (ADR 0008) y los entrega a `render` por la prop
 * `estados`; el Tema solo decide como se ven.
 *
 * - Foco: Nodos y Grupos visibles en orden del Modelo (`ordenDeFoco`); `moverFoco`
 *   avanza o retrocede en ese orden, o salta por Aristas al Nodo vecino.
 * - Ruta: una secuencia de Nodos. `rutaMasCorta` la halla entre dos Nodos (siguiendo
 *   la direccion de las Aristas y, si no hay camino, sin ella); `estadosDeRuta`
 *   marca `en-ruta` los Nodos y Aristas de la ruta y `atenuado` todo lo demas.
 */
import { idDeArista } from 'canonico';
import type { AristaResuelta, VistaResuelta } from 'canonico';
import type { Estados, EstadoVisual } from 'render';

export type MovimientoDeFoco = 'siguiente' | 'anterior' | 'adelante' | 'atras';

/** Ids de los Nodos y Grupos de la Vista en orden del Modelo (preorden: un Grupo antes que sus hijos). */
export const ordenDeFoco = (vista: VistaResuelta): string[] => vista.nodes.map((n) => n.id);

/**
 * Foco que resulta de un movimiento. `siguiente`/`anterior` recorren el orden del Modelo y devuelven
 * `undefined` al salirse por un extremo (el foco sale del diagrama). `adelante`/`atras` saltan por una
 * Arista saliente/entrante al primer vecino en orden del Modelo; sin vecino, el foco no cambia.
 * Sin foco previo, cualquier movimiento aterriza en el primer Nodo.
 */
export function moverFoco(vista: VistaResuelta, actual: string | undefined, movimiento: MovimientoDeFoco): string | undefined {
  const orden = ordenDeFoco(vista);
  const i = actual === undefined ? -1 : orden.indexOf(actual);
  if (i < 0) return orden[0];
  if (movimiento === 'siguiente') return orden[i + 1];
  if (movimiento === 'anterior') return orden[i - 1];
  const vecinos = new Set(vista.edges.flatMap((a) => (movimiento === 'adelante' ? (a.from.node === actual ? [a.to.node] : []) : a.to.node === actual ? [a.from.node] : [])));
  return orden.find((id) => vecinos.has(id)) ?? actual;
}

/** Vecinos de un Nodo: primero los alcanzables en la direccion de las Aristas; con `sinDireccion`, en ambas. */
function vecinos(aristas: readonly AristaResuelta[], id: string, sinDireccion: boolean): string[] {
  return aristas.flatMap((a) => (a.from.node === id ? [a.to.node] : sinDireccion && a.to.node === id ? [a.from.node] : []));
}

/** Ruta mas corta de Nodos entre `desde` y `hasta` (ambos incluidos), o `undefined` si no hay camino. */
export function rutaMasCorta(vista: VistaResuelta, desde: string, hasta: string): string[] | undefined {
  for (const sinDireccion of [false, true]) {
    const previo = new Map<string, string | undefined>([[desde, undefined]]);
    const cola = [desde];
    for (let c = 0; c < cola.length; c++) {
      const id = cola[c]!;
      if (id === hasta) break;
      for (const v of vecinos(vista.edges, id, sinDireccion)) {
        if (previo.has(v)) continue;
        previo.set(v, id);
        cola.push(v);
      }
    }
    if (!previo.has(hasta)) continue;
    const ruta: string[] = [];
    for (let id: string | undefined = hasta; id !== undefined; id = previo.get(id)) ruta.unshift(id);
    return ruta;
  }
  return undefined;
}

/**
 * Estados de una ruta: `en-ruta` en sus Nodos y en las Aristas que unen Nodos consecutivos, `atenuado`
 * en el resto de Nodos y Aristas de la Vista. Una ruta vacia no marca nada.
 */
export function estadosDeRuta(vista: VistaResuelta, ruta: readonly string[]): Estados {
  if (ruta.length === 0) return {};
  const nodos = new Set(ruta);
  const enRuta = (a: AristaResuelta): boolean =>
    ruta.some((id, i) => {
      const sig = ruta[i + 1];
      return sig !== undefined && ((a.from.node === id && a.to.node === sig) || (a.from.node === sig && a.to.node === id));
    });
  const estados: Record<string, readonly EstadoVisual[]> = {};
  for (const n of vista.nodes) estados[n.id] = [nodos.has(n.id) ? 'en-ruta' : 'atenuado'];
  for (const a of vista.edges) estados[idDeArista(a)] = [enRuta(a) ? 'en-ruta' : 'atenuado'];
  return estados;
}

/** Une dos mapas de estados: los de cada id se concatenan (los de `base` primero). */
export function unirEstados(base: Estados, extra: Estados): Estados {
  const ids = Object.keys(extra);
  if (ids.length === 0) return base;
  const unido: Record<string, readonly EstadoVisual[]> = { ...base };
  for (const id of ids) unido[id] = [...(unido[id] ?? []), ...extra[id]!];
  return unido;
}
