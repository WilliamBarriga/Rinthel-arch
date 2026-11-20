/** Montaje de la app de `dev` sobre `devEnMemoria` (Sesion real, transporte falso) y ayudas de puntero para jsdom. */
import { configure, fireEvent, render, waitFor } from '@testing-library/react';

import { layoutView } from 'layout';
import { hashDelNavegador } from 'shell';
import type { AdaptadorDeLayout } from 'shell';

import { devEnMemoria } from '../src/contrato';
import type { DevEnMemoria } from '../src/contrato';
import { Estudio } from '../navegador/estudio';
import type { Plataforma } from '../navegador/comandos/teclas';

// jsdom no mide rangos de texto: CodeMirror los pide al dibujar el cursor y la seleccion. Sin geometria (cajas vacias);
// la posicion de marcadores y el scroll se prueban en Chromium.
if (typeof Range !== 'undefined' && !('getClientRects' in Range.prototype)) {
  const vacio = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Object.assign(Range.prototype, { getClientRects: () => Object.assign([], { item: () => null }), getBoundingClientRect: () => vacio });
}

// La primera Geometria pasa por ELK en frio (mas de 1 s en una maquina cargada).
configure({ asyncUtilTimeout: 15_000 });

/** El layout real (el del Worker en el navegador), para las Vistas cuya Geometria aun no llego del servidor. */
export const layoutReal: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });

export interface OpcionesDeMontaje {
  hash?: string;
  plataforma?: Plataforma;
  /** Archivos de `--theme-path` (solo lectura). */
  temas?: Record<string, string>;
  /** Envuelve el `fetch` del fake (para anotar peticiones o inyectar fallos de red). */
  envolverFetch?: (fetchDelFake: typeof fetch) => typeof fetch;
}

export async function montarEstudio(propios: Record<string, string>, { hash = '', plataforma = 'otras', temas, envolverFetch = (f) => f }: OpcionesDeMontaje = {}): Promise<{ dev: DevEnMemoria; contenedor: HTMLElement }> {
  window.history.replaceState(null, '', `/${hash}`);
  const dev = await devEnMemoria({ propios, ...(temas !== undefined && { temas }) });
  const { container } = render(<Estudio fetch={envolverFetch(dev.fetch)} eventos={dev.eventos} hash={hashDelNavegador(window)} layout={layoutReal} confirmar={() => false} plataforma={plataforma} />);
  return { dev, contenedor: container };
}

/** Espera a que el lienzo de `vista` tenga su layout. */
export const lienzoListo = (contenedor: HTMLElement, vista: string): Promise<HTMLElement> =>
  waitFor(() => {
    const lienzo = contenedor.querySelector<HTMLElement>(`.rd-vista[data-vista="${vista}"][data-layout="listo"]`);
    if (lienzo === null) throw new Error(`El lienzo de '${vista}' no esta listo`);
    return lienzo;
  });

/** Clic en el centro de un Nodo dibujado, traducido a pantalla con la camara (como haria el raton). */
export function pulsarNodo(contenedor: HTMLElement, id: string): void {
  const dibujo = contenedor.querySelector<HTMLElement>('[data-diagram]')!;
  const caja = contenedor.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(caja.style.transform)!;
  const x = Number(t[1]) + Number.parseFloat(caja.style.width) / 2;
  const y = Number(t[2]) + Number.parseFloat(caja.style.height) / 2;
  const [vx, vy, vw] = dibujo.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number, number];
  const k = Number.parseFloat(dibujo.style.width) / vw;
  fireEvent.click(dibujo, { clientX: (x - vx) * k, clientY: (y - vy) * k });
}
