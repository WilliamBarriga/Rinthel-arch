/** Painters of the shape Family (except `rect`, in `sheet.ts`). */
import { px } from './common';
import type { Painter } from './common';

export const SHAPE_PAINTERS = {
  pill: () => ({ 'border-radius': '9999px' }),
  // Corners cut at top left and bottom right. `corner-shape` makes the border and the shadow
  // follow the cut; a browser without `corner-shape` draws those two corners rounded.
  cut: ({ cut }) => ({ 'border-radius': `${px(cut)} 0 ${px(cut)} 0`, 'corner-shape': 'bevel' }),
  circle: () => ({ 'border-radius': '50%' }),
} satisfies Record<string, Painter>;
