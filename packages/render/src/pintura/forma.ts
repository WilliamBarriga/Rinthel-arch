/** Pintores de la Familia forma (salvo `rect`, en `hoja.ts`). */
import { px } from './comun';
import type { Pintor } from './comun';

export const PINTORES_DE_FORMA = {
  pill: () => ({ 'border-radius': '9999px' }),
  // Esquinas cortadas arriba a la izquierda y abajo a la derecha. `corner-shape` hace que el borde y la sombra
  // sigan el corte; un navegador sin `corner-shape` dibuja esas dos esquinas redondeadas.
  cut: ({ cut }) => ({ 'border-radius': `${px(cut)} 0 ${px(cut)} 0`, 'corner-shape': 'bevel' }),
  circle: () => ({ 'border-radius': '50%' }),
} satisfies Record<string, Pintor>;
