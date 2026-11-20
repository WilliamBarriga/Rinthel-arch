/** Montaje de la app de `dev` sobre `devEnMemoria` (Sesion real, transporte falso) y ayudas de puntero para jsdom. */
import { configure, fireEvent, render, waitFor } from '@testing-library/react';

import { layoutView } from 'layout';
import { hashDelNavegador } from 'shell';
import type { AdaptadorDeLayout } from 'shell';

import { devEnMemoria } from '../src/contrato';
import type { DevEnMemoria } from '../src/contrato';
import { Estudio } from '../navegador/estudio';
import type { Plataforma } from '../navegador/comandos/teclas';

// La primera Geometria pasa por ELK en frio (mas de 1 s en una maquina cargada).
configure({ asyncUtilTimeout: 15_000 });

/** El layout real (el del Worker en el navegador), para las Vistas cuya Geometria aun no llego del servidor. */
export const layoutReal: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });

/** `temas`: archivos de `--theme-path` (solo lectura); `actividad`: texto inicial de `.diagrams/actividad.jsonl`. */
export async function montarEstudio(propios: Record<string, string>, { hash = '', plataforma = 'otras', temas, actividad }: { hash?: string; plataforma?: Plataforma; temas?: Record<string, string>; actividad?: string } = {}): Promise<{ dev: DevEnMemoria; contenedor: HTMLElement }> {
  window.history.replaceState(null, '', `/${hash}`);
  const dev = await devEnMemoria({ propios, ...(temas !== undefined && { temas }), ...(actividad !== undefined && { actividad }) });
  const { container } = render(<Estudio fetch={dev.fetch} eventos={dev.eventos} hash={hashDelNavegador(window)} layout={layoutReal} confirmar={() => false} plataforma={plataforma} />);
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
