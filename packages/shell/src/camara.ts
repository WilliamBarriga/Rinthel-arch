/** Camara del shell: encuadre, conversion con d3-zoom y compensacion al cambiar la geometria. Sin estado. */
import { zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';

import type { NodeBox, Geometry, ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';
import type { Camera } from 'render';

/** Camara que muestra toda la geometria, centrada y con margen; no amplia por encima de 1:1. */
export function encuadrar(geometria: Geometry, ancho: number, alto: number, margen: number): Camera {
  const escala = Math.min(1, ancho / (geometria.width + 2 * margen), alto / (geometria.height + 2 * margen));
  const [w, h] = [ancho / escala, alto / escala];
  return { x: (geometria.width - w) / 2, y: (geometria.height - h) / 2, width: w, height: h };
}

export function aCamara(t: ZoomTransform, ancho: number, alto: number): Camera {
  // `+ 0` normaliza -0 a 0.
  return { x: -t.x / t.k + 0, y: -t.y / t.k + 0, width: ancho / t.k, height: alto / t.k };
}

export function aTransform(c: Camera, ancho: number): ZoomTransform {
  const k = ancho / c.width;
  return zoomIdentity.translate(-c.x * k, -c.y * k).scale(k);
}

export const mismaTransform = (a: ZoomTransform, b: ZoomTransform): boolean => a.k === b.k && a.x === b.x && a.y === b.y;

/**
 * Camara tras un cambio de geometria que deja el Grupo en la misma posicion de
 * pantalla: se desplaza lo mismo que se movio la caja absoluta del Grupo. El
 * tamano de la camara (zoom) no cambia.
 */
export function compensarCamara(camara: Camera, antes: NodeBox, despues: NodeBox): Camera {
  return { ...camara, x: camara.x + despues.x - antes.x, y: camara.y + despues.y - antes.y };
}

/**
 * Caja del Grupo `id` que se mantiene fija en pantalla al expandir o colapsar. En grafo es su caja absoluta. En secuencia
 * es el `box` del Grupo si esta abierto o, si no, la cabecera de su Lifeline; solo cuenta el borde izquierdo, asi que
 * la `y` queda en 0 (la camara no se desplaza en vertical).
 */
export function cajaDeAncla(vista: ResolvedView, geometria: Geometry, id: string): NodeBox | undefined {
  if (geometria.kind !== 'secuencia') return geometryIndex(vista, geometria).boxes.get(id);
  const caja = geometria.groups.find((grupo) => grupo.id === id) ?? geometria.nodes[id];
  return caja === undefined ? undefined : { ...caja, y: 0 };
}
