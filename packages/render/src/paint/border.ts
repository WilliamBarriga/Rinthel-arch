/** Painters of the border Family (except `border`, in `sheet.ts`). */
import { css, px } from './common';
import type { Painter } from './common';

const stroke =
  (style: 'dashed' | 'dotted'): Painter =>
  ({ color, width }) => ({ border: `${px(width)} ${style} ${css(color)}` });

export const BORDER_PAINTERS = {
  dashed: stroke('dashed'),
  dotted: stroke('dotted'),
  outline: ({ color, width, offset }) => ({ outline: `${px(width)} solid ${css(color)}`, 'outline-offset': px(offset) }),
} satisfies Record<string, Painter>;
