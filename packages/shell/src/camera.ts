/** Shell camera: framing, conversion with d3-zoom and compensation when the geometry changes. Stateless. */
import { zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';

import type { NodeBox, Geometry, ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';
import type { Camera } from 'render';

/** Camera that shows the whole geometry, centered and with margin; it does not zoom in beyond 1:1. */
export function fitTo(geometry: Geometry, width: number, height: number, margin: number): Camera {
  const scale = Math.min(1, width / (geometry.width + 2 * margin), height / (geometry.height + 2 * margin));
  const [w, h] = [width / scale, height / scale];
  return { x: (geometry.width - w) / 2, y: (geometry.height - h) / 2, width: w, height: h };
}

export function toCamera(t: ZoomTransform, width: number, height: number): Camera {
  // `+ 0` normaliza -0 a 0.
  return { x: -t.x / t.k + 0, y: -t.y / t.k + 0, width: width / t.k, height: height / t.k };
}

export function toTransform(c: Camera, width: number): ZoomTransform {
  const k = width / c.width;
  return zoomIdentity.translate(-c.x * k, -c.y * k).scale(k);
}

export const sameTransform = (a: ZoomTransform, b: ZoomTransform): boolean => a.k === b.k && a.x === b.x && a.y === b.y;

/**
 * Camera after a geometry change that keeps the Group at the same screen
 * position: it shifts as much as the Group's absolute box moved. The
 * camera size (zoom) does not change.
 */
export function compensateCamera(camera: Camera, before: NodeBox, after: NodeBox): Camera {
  return { ...camera, x: camera.x + after.x - before.x, y: camera.y + after.y - before.y };
}

/**
 * Box of Group `id` that stays fixed on screen when expanding or collapsing. In a graph it is its absolute box. In sequence
 * it is the Group's `box` if open or, otherwise, its Lifeline header; only the left border counts, so
 * `y` stays at 0 (the camera does not shift vertically).
 */
export function anchorBox(view: ResolvedView, geometry: Geometry, id: string): NodeBox | undefined {
  if (geometry.kind !== 'secuencia') return geometryIndex(view, geometry).boxes.get(id);
  const box = geometry.groups.find((group) => group.id === id) ?? geometry.nodes[id];
  return box === undefined ? undefined : { ...box, y: 0 };
}
