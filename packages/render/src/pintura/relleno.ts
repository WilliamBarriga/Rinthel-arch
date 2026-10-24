/**
 * Pintores de la Familia relleno. Todos salvo `solid` pintan en
 * `background-image`/`background-size`, que la hoja acumula en el orden de la
 * pila; el ruido es un SVG `feTurbulence` en un data URI, determinista y sin red.
 */
import { css, px } from './comun';
import type { Pintor } from './comun';

const capa = (imagen: string, tamano = 'auto'): Record<string, string> => ({ 'background-image': imagen, 'background-size': tamano });

const ruido = (frecuencia: number, opacidad: number): string => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${frecuencia}' numOctaves='2' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='${opacidad}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

export const PINTORES_DE_RELLENO = {
  solid: ({ color }) => ({ background: css(color) }),
  gradient: ({ from, to, angle }) => capa(`linear-gradient(${Number(angle)}deg,${css(from)},${css(to)})`),
  radial: ({ from, to, x, y }) => capa(`radial-gradient(circle at ${Number(x)}% ${Number(y)}%,${css(from)},${css(to)} 110%)`),
  disc: ({ color, radius, x, y, unit }) => {
    const en = (valor: number | string | undefined): string => (unit === 'px' ? px(valor) : `${Number(valor)}%`);
    return capa(`radial-gradient(circle at ${en(x)} ${en(y)},${css(color)} 0 ${px(radius)},transparent ${px(Number(radius) + 1)})`);
  },
  grid: ({ color, size, width }) =>
    capa(
      `linear-gradient(to right,${css(color)} ${px(width)},transparent ${px(width)}),linear-gradient(to bottom,${css(color)} ${px(width)},transparent ${px(width)})`,
      `${px(size)} ${px(size)},${px(size)} ${px(size)}`,
    ),
  lines: ({ color, size, width, angle }) =>
    capa(`repeating-linear-gradient(${Number(angle)}deg,${css(color)} 0,${css(color)} ${px(width)},transparent ${px(width)},transparent ${px(size)})`),
  dots: ({ color, size, radius }) => capa(`radial-gradient(circle,${css(color)} ${px(radius)},transparent ${px(Number(radius) + 0.5)})`, `${px(size)} ${px(size)}`),
  noise: ({ frequency, opacity }) => capa(ruido(Number(frequency), Number(opacity)), '200px 200px'),
} satisfies Record<string, Pintor>;
