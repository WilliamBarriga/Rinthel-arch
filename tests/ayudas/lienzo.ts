/// <reference lib="dom" />
/**
 * Ayudas de puntero sobre el lienzo dibujado, compartidas por las pruebas de `shell` y `dev-ui` (unica copia). El
 * lienzo no tiene rol que consultar: se lee por `data-diagram`, `data-camara` y `data-id` (docs/CODING.md, Pruebas).
 * `fireEvent` entra como argumento para que los eventos pasen por el `act` de Testing Library de cada paquete.
 */

/** Lo que las ayudas usan de `fireEvent` de Testing Library. */
export interface EventosDePuntero {
  click(elemento: Element, init?: MouseEventInit): boolean;
  doubleClick(elemento: Element, init?: MouseEventInit): boolean;
}

export interface AyudasDeLienzo {
  /** Contenedor del dibujo (`Diagram`): lleva la camara en `data-camara`. */
  dibujoDe(contenedor: ParentNode): HTMLElement;
  /** Camara dibujada, `x y ancho alto`. */
  camaraDe(contenedor: ParentNode): string | null;
  /** Esquina `[x, y]` (coordenadas del lienzo) de una caja dibujada; las cajas son planas y absolutas. */
  posicionDe(contenedor: ParentNode, id: string): [number, number] | undefined;
  /** Opacidad en linea de la parte propia de un Nodo, o null si no tiene (1). */
  opacidadDeNodo(contenedor: ParentNode, id: string): string | null;
  /** Clic en el punto (x, y) del lienzo: lo traduce a pantalla con la camara dibujada, como haria el raton. */
  pulsarEn(contenedor: ParentNode, x: number, y: number, init?: MouseEventInit): void;
  /** Clic en el centro de un Nodo dibujado. */
  pulsarNodo(contenedor: ParentNode, id: string, init?: MouseEventInit): void;
  /** Doble clic en el centro de un Nodo dibujado (dos clics y el `dblclick`, como el raton). */
  dobleClicEnNodo(contenedor: ParentNode, id: string): void;
}

export function ayudasDeLienzo(fireEvent: EventosDePuntero): AyudasDeLienzo {
  const dibujoDe = (contenedor: ParentNode): HTMLElement => contenedor.querySelector<HTMLElement>('[data-diagram]')!;

  const posicionDe = (contenedor: ParentNode, id: string): [number, number] | undefined => {
    const caja = contenedor.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(caja?.style.transform ?? '');
    return t === null ? undefined : [Number(t[1]), Number(t[2])];
  };

  /** Punto de pantalla del punto (x, y) del lienzo, con la camara dibujada. */
  const enPantalla = (dibujo: HTMLElement, x: number, y: number): { clientX: number; clientY: number } => {
    const [vx, vy, vw] = dibujo.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number, number];
    const k = Number.parseFloat(dibujo.style.width) / vw;
    return { clientX: (x - vx) * k, clientY: (y - vy) * k };
  };

  /** Cada evento puede volver a dibujar el lienzo: el destino se busca de nuevo antes de cada uno. */
  const centroDeNodo = (contenedor: ParentNode, id: string): { dibujo: HTMLElement; punto: { clientX: number; clientY: number } } => {
    const [x, y] = posicionDe(contenedor, id)!;
    const caja = contenedor.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const dibujo = dibujoDe(contenedor);
    return { dibujo, punto: enPantalla(dibujo, x + Number.parseFloat(caja.style.width) / 2, y + Number.parseFloat(caja.style.height) / 2) };
  };

  return {
    dibujoDe,
    camaraDe: (contenedor) => dibujoDe(contenedor).getAttribute('data-camara'),
    posicionDe,
    opacidadDeNodo: (contenedor, id) => {
      const valor = contenedor.querySelector<HTMLElement>(`[data-id="${id}"] [data-part="nodo"]`)?.style.opacity;
      return valor === undefined || valor === '' ? null : valor;
    },
    pulsarEn: (contenedor, x, y, init = {}) => {
      const dibujo = dibujoDe(contenedor);
      fireEvent.click(dibujo, { ...enPantalla(dibujo, x, y), ...init });
    },
    pulsarNodo: (contenedor, id, init = {}) => {
      const { dibujo, punto } = centroDeNodo(contenedor, id);
      fireEvent.click(dibujo, { ...punto, ...init });
    },
    dobleClicEnNodo: (contenedor, id) => {
      const en = () => centroDeNodo(contenedor, id);
      fireEvent.click(en().dibujo, { ...en().punto, detail: 1 });
      fireEvent.click(en().dibujo, { ...en().punto, detail: 2 });
      fireEvent.doubleClick(en().dibujo, en().punto);
    },
  };
}
