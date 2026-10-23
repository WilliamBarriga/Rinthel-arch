import { fireEvent } from '@testing-library/react';

/** Clic en el punto (x, y) del lienzo: lo traduce a pantalla con el viewBox dibujado, como haria el raton. */
export function pulsarEn(contenedor: HTMLElement, x: number, y: number, init: MouseEventInit = {}): void {
  const svg = contenedor.querySelector('svg[viewBox]')!;
  const [vx, vy, vw] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
  const k = Number(svg.getAttribute('width')) / vw;
  fireEvent.click(svg, { clientX: (x - vx) * k, clientY: (y - vy) * k, ...init });
}

/** Clic en el centro de un Nodo dibujado (suma las traslaciones de sus Grupos). */
export function pulsarNodo(contenedor: HTMLElement, id: string, init: MouseEventInit = {}): void {
  let x = 0;
  let y = 0;
  for (let e: Element | null = contenedor.querySelector(`svg [data-id="${id}"]`); e !== null; e = e.parentElement) {
    const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(e.getAttribute('transform') ?? '');
    if (e.hasAttribute('data-id') && t !== null) {
      x += Number(t[1]);
      y += Number(t[2]);
    }
  }
  const rect = contenedor.querySelector(`svg [data-id="${id}"] > [data-part="nodo"] > rect`)!;
  pulsarEn(contenedor, x + Number(rect.getAttribute('width')) / 2, y + Number(rect.getAttribute('height')) / 2, init);
}
