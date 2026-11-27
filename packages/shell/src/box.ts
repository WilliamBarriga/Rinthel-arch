/** Point inside a box, in canvas coordinates: the single version of the border for hit-test and drag. */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether `p` falls in `box` (borders included), grown by `margin` units on each side. */
export const contains = (box: Box, p: { x: number; y: number }, margin = 0): boolean =>
  p.x >= box.x - margin && p.x <= box.x + box.width + margin && p.y >= box.y - margin && p.y <= box.y + box.height + margin;
