/** Pintores de la Familia borde/trazo (salvo `border`, en `hoja.ts`). */
import { css, px } from './comun';
import type { Pintor } from './comun';

const trazo =
  (estilo: 'dashed' | 'dotted'): Pintor =>
  ({ color, width }) => ({ border: `${px(width)} ${estilo} ${css(color)}` });

export const PINTORES_DE_BORDE = {
  dashed: trazo('dashed'),
  dotted: trazo('dotted'),
  outline: ({ color, width, offset }) => ({ outline: `${px(width)} solid ${css(color)}`, 'outline-offset': px(offset) }),
} satisfies Record<string, Pintor>;
