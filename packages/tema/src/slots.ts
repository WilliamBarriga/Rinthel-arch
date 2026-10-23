/**
 * Colocacion de Slots: dado el Tema (por sus Metricas) y el contenido de un
 * Nodo, el rectangulo de cada Slot dentro de la caja y el tamano de esta. Es el
 * unico sitio que decide posiciones: `layout` lo usa para medir la caja y para
 * los puertos de Atributo, `render` pinta cada Slot en su rectangulo, asi que
 * lo reservado es lo dibujado. Los Slots se apilan en columna en el orden del
 * Tema; `attrs` sin Atributos no reserva espacio. Los rectangulos son relativos
 * a la esquina superior izquierda de la caja del Nodo.
 */
import type { Atributo } from 'canonico';

import type { NombreDeSlot } from './catalogo';
import { textoDeAtributo } from './metricas';
import type { Metricas } from './metricas';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColocacionDeNodo {
  /** Tamano de la caja del Nodo. */
  width: number;
  height: number;
  /** Rectangulo de cada Slot mostrado (relativo a la caja). */
  slots: Partial<Record<NombreDeSlot, Rect>>;
  /** Rectangulo de cada fila de Atributo, en orden (vacio sin `attrs`). */
  filas: Rect[];
}

/** Apila los Slots listados por el Tema en una caja de ancho `ancho`. */
function apilar(metricas: Metricas, filas: number, ancho: number): { slots: ColocacionDeNodo['slots']; alto: number } {
  const slots: ColocacionDeNodo['slots'] = {};
  let y = 0;
  for (const nombre of metricas.slots) {
    const alto = nombre === 'title' ? metricas.cabecera : filas * metricas.fila;
    if (alto === 0) continue;
    slots[nombre] = { x: 0, y, width: ancho, height: alto };
    y += alto;
  }
  return { slots, alto: y };
}

/**
 * Colocacion de un Nodo hoja (o Grupo colapsado) con `atributos` ya filtrados
 * por `atributosVisibles`. El ancho sale del texto mas largo entre los Slots
 * mostrados; el alto, de la suma de sus rectangulos.
 */
export function colocarNodo(titulo: string, atributos: readonly Atributo[], metricas: Metricas): ColocacionDeNodo {
  const { fontSize, factorDeAncho, escalaAtributo } = metricas;
  const delTitulo = metricas.slots.includes('title') ? titulo.length * fontSize * factorDeAncho : 0;
  const deAtributos = atributos.map((a) => textoDeAtributo(a).length * fontSize * escalaAtributo * factorDeAncho);
  const ancho = Math.max(metricas.anchoMinimo, Math.ceil(Math.max(delTitulo, ...deAtributos) + metricas.paddingHorizontal));
  return colocarEnCaja(metricas, atributos.length, ancho);
}

/** Colocacion dentro de una caja de ancho conocido (la que entrega la Geometria); `render` la usa para pintar. */
export function colocarEnCaja(metricas: Metricas, filas: number, ancho: number): ColocacionDeNodo {
  const { slots, alto } = apilar(metricas, filas, ancho);
  const zona = slots.attrs;
  return {
    width: ancho,
    height: alto,
    slots,
    filas:
      zona === undefined
        ? []
        : Array.from({ length: filas }, (_, i) => ({ x: zona.x, y: zona.y + i * metricas.fila, width: zona.width, height: metricas.fila })),
  };
}
