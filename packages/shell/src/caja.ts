/** Punto dentro de caja, en coordenadas del lienzo: la unica version del borde para el hit-test y el arrastre. */

interface Caja {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Si `p` cae en `caja` (bordes incluidos), agrandada `margen` unidades por cada lado. */
export const contiene = (caja: Caja, p: { x: number; y: number }, margen = 0): boolean =>
  p.x >= caja.x - margen && p.x <= caja.x + caja.width + margen && p.y >= caja.y - margen && p.y <= caja.y + caja.height + margen;
