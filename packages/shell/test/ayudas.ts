import { fireEvent } from '@testing-library/react';

/** Contenedor del dibujo (`Diagram`): lleva la camara en `data-camara`. */
export const dibujoDe = (contenedor: ParentNode): HTMLElement => contenedor.querySelector<HTMLElement>('[data-diagram]')!;

/** Camara dibujada, `x y ancho alto`. */
export const camaraDe = (contenedor: ParentNode): string | null => dibujoDe(contenedor).getAttribute('data-camara');

/** Esquina `[x, y]` (coordenadas del lienzo) de una caja dibujada; las cajas son planas y absolutas. */
export function posicionDe(contenedor: ParentNode, id: string): [number, number] | undefined {
  const caja = contenedor.querySelector<HTMLElement>(`[data-id="${id}"]`);
  const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(caja?.style.transform ?? '');
  return t === null ? undefined : [Number(t[1]), Number(t[2])];
}

/** Opacidad en linea de la parte propia de un Nodo, o null si no tiene (1). */
export function opacidadDeNodo(contenedor: ParentNode, id: string): string | null {
  const valor = contenedor.querySelector<HTMLElement>(`[data-id="${id}"] [data-part="nodo"]`)?.style.opacity;
  return valor === undefined || valor === '' ? null : valor;
}

/** Clic en el punto (x, y) del lienzo: lo traduce a pantalla con la camara dibujada, como haria el raton. */
export function pulsarEn(contenedor: HTMLElement, x: number, y: number, init: MouseEventInit = {}): void {
  const dibujo = dibujoDe(contenedor);
  const [vx, vy, vw] = dibujo.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number, number];
  const k = Number.parseFloat(dibujo.style.width) / vw;
  fireEvent.click(dibujo, { clientX: (x - vx) * k, clientY: (y - vy) * k, ...init });
}

/** Clic en el centro de un Nodo dibujado. */
export function pulsarNodo(contenedor: HTMLElement, id: string, init: MouseEventInit = {}): void {
  const [x, y] = posicionDe(contenedor, id)!;
  const caja = contenedor.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  pulsarEn(contenedor, x + Number.parseFloat(caja.style.width) / 2, y + Number.parseFloat(caja.style.height) / 2, init);
}
