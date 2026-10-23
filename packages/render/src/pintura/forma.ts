/** Pintores de la Familia forma (salvo `rect`, en `hoja.ts`). */
import { px } from './comun';
import type { Pintor } from './comun';

export const PINTORES_DE_FORMA = {
  pill: () => ({ 'border-radius': '9999px' }),
  cut: ({ cut }) => ({ 'clip-path': `polygon(0 0,calc(100% - ${px(cut)}) 0,100% ${px(cut)},100% 100%,0 100%)` }),
  circle: () => ({ 'border-radius': '50%' }),
} satisfies Record<string, Pintor>;
