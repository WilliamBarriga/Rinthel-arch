/** Montaje de la app de `dev` sobre `devEnMemoria` (Sesion real, transporte falso) y ayudas de puntero para jsdom. */
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { layoutView } from 'layout';
import { hashDelNavegador } from 'shell';
import type { AdaptadorDeLayout } from 'shell';

import { ayudasDeLienzo } from '../../../tests/ayudas/lienzo';
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
  /** Texto inicial de `.diagrams/actividad.jsonl`. */
  actividad?: string;
  /** Envuelve el `fetch` del fake (para anotar peticiones o inyectar fallos de red). */
  envolverFetch?: (fetchDelFake: typeof fetch) => typeof fetch;
}

export async function montarEstudio(propios: Record<string, string>, { hash = '', plataforma = 'otras', temas, actividad, envolverFetch = (f) => f }: OpcionesDeMontaje = {}): Promise<{ dev: DevEnMemoria; contenedor: HTMLElement }> {
  window.history.replaceState(null, '', `/${hash}`);
  const dev = await devEnMemoria({ propios, ...(temas !== undefined && { temas }), ...(actividad !== undefined && { actividad }) });
  const { container } = render(<Estudio fetch={envolverFetch(dev.fetch)} eventos={dev.eventos} hash={hashDelNavegador(window)} layout={layoutReal} confirmar={() => false} plataforma={plataforma} />);
  return { dev, contenedor: container };
}

/** Workspace minimo de las pruebas de la app: dos Nodos, una Arista y la Vista `mapa`. */
export const DSL_BASICO = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}
`;

export interface PeticionAnotada {
  ruta: string;
  cuerpo: unknown;
}

/**
 * Anota cada POST que la pagina manda a `dev` (solo los de `ruta`, si se da). `antes(n)` corre con el numero de la
 * peticion anotada antes de reenviarla al fake, para provocar carreras.
 */
export function anotarPeticiones({ ruta, antes }: { ruta?: string; antes?: (n: number) => void } = {}): {
  posts: PeticionAnotada[];
  /** Solo los cuerpos, en el mismo orden. */
  cuerpos: unknown[];
  envolverFetch: NonNullable<OpcionesDeMontaje['envolverFetch']>;
} {
  const posts: PeticionAnotada[] = [];
  const cuerpos: unknown[] = [];
  return {
    posts,
    cuerpos,
    envolverFetch: (f) => (async (entrada: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && (ruta === undefined || String(entrada) === ruta)) {
        const cuerpo: unknown = JSON.parse(String(init.body));
        posts.push({ ruta: String(entrada), cuerpo });
        cuerpos.push(cuerpo);
        antes?.(posts.length);
      }
      return f(entrada, init);
    }) as typeof fetch,
  };
}

/** El marco se monta de nuevo al llegar la primera Fuente: espera a un lienzo y elige la pestana `nombre`. */
export async function abrirPestana(nombre: string): Promise<void> {
  await waitFor(() => {
    if (document.querySelector('.rd-vista[data-vista]') === null) throw new Error('Sin lienzo');
  });
  fireEvent.click(await screen.findByRole('tab', { name: nombre }));
}

/** Espera a que el lienzo de `vista` tenga su layout. */
export const lienzoListo = (contenedor: HTMLElement, vista: string): Promise<HTMLElement> =>
  waitFor(() => {
    const lienzo = contenedor.querySelector<HTMLElement>(`.rd-vista[data-vista="${vista}"][data-layout="listo"]`);
    if (lienzo === null) throw new Error(`El lienzo de '${vista}' no esta listo`);
    return lienzo;
  });

/** Clic y doble clic en el centro de un Nodo dibujado; la unica copia vive en `tests/ayudas/lienzo.ts`. */
export const { dobleClicEnNodo, pulsarNodo } = ayudasDeLienzo(fireEvent);
