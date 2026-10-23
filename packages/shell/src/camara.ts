/**
 * Camara del shell: encuadre inicial, conversion con la transformacion de
 * d3-zoom y compensacion al cambiar la geometria (ADR 0003). Sin estado.
 */
import { zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';

import type { CajaDeNodo, Geometria } from 'layout';
import type { Camara } from 'render';

/** Camara que muestra toda la geometria, centrada y con margen; no amplia por encima de 1:1. */
export function encuadrar(geometria: Geometria, ancho: number, alto: number, margen: number): Camara {
  const escala = Math.min(1, ancho / (geometria.width + 2 * margen), alto / (geometria.height + 2 * margen));
  const [w, h] = [ancho / escala, alto / escala];
  return { x: (geometria.width - w) / 2, y: (geometria.height - h) / 2, width: w, height: h };
}

export function aCamara(t: ZoomTransform, ancho: number, alto: number): Camara {
  // `+ 0` normaliza -0 a 0.
  return { x: -t.x / t.k + 0, y: -t.y / t.k + 0, width: ancho / t.k, height: alto / t.k };
}

export function aTransform(c: Camara, ancho: number): ZoomTransform {
  const k = ancho / c.width;
  return zoomIdentity.translate(-c.x * k, -c.y * k).scale(k);
}

export const mismaTransform = (a: ZoomTransform, b: ZoomTransform): boolean => a.k === b.k && a.x === b.x && a.y === b.y;

/**
 * Camara tras un cambio de geometria que deja el Grupo en la misma posicion de
 * pantalla: se desplaza lo mismo que se movio la caja absoluta del Grupo. El
 * tamano de la camara (zoom) no cambia.
 */
export function compensarCamara(camara: Camara, antes: CajaDeNodo, despues: CajaDeNodo): Camara {
  return { ...camara, x: camara.x + despues.x - antes.x, y: camara.y + despues.y - antes.y };
}
