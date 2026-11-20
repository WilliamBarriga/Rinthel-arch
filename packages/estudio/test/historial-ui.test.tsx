// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { montarEstudio } from './ayudas-de-ui';
import type { OpcionesDeMontaje } from './ayudas-de-ui';
import type { DevEnMemoria } from '../src/contrato';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const DSL = `specification {
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

const moverPin = async (dev: DevEnMemoria, nodo: string, x: number): Promise<void> => {
  const res = await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ tipo: 'mover-pin', vista: 'mapa', nodo, x, y: 0 }) });
  expect(res.status).toBe(200);
};

/** El marco se monta de nuevo al llegar la primera Fuente: se espera al lienzo antes de elegir la pestana. */
async function abrirHistorial(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('.rd-vista[data-vista]')).not.toBeNull());
  fireEvent.click(await screen.findByRole('tab', { name: 'Historial' }));
  return screen.findByRole('list', { name: 'Historial de cambios' });
}

const filas = (lista: HTMLElement): HTMLElement[] => within(lista).getAllByRole('listitem');
const boton = (lista: HTMLElement, nombre: RegExp): HTMLButtonElement => within(lista).getByRole('button', { name: nombre });

describe('isla de Historial', () => {
  it('lista lo mas reciente arriba con descripcion, archivos y hora relativa, marca la posicion actual y termina en Inicio', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL });
    await moverPin(dev, 'api', 10);
    await moverPin(dev, 'db', 20);
    const lista = await abrirHistorial();

    await waitFor(() => expect(filas(lista)).toHaveLength(3));
    expect(filas(lista).map((f) => f.textContent)).toEqual([expect.stringMatching(/mover db en mapa.*main\.dg.*(ahora|hace)/), expect.stringMatching(/mover api en mapa/), expect.stringMatching(/Inicio/)]);
    expect(boton(lista, /mover db en mapa/).getAttribute('aria-current')).toBe('step');
    expect(boton(lista, /mover api en mapa/).getAttribute('aria-current')).toBeNull();
  });

  it('un clic salta a la entrada sin apilar: el futuro queda atenuado y se puede volver a el', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL });
    await moverPin(dev, 'api', 10);
    const conUno = dev.workspace.texto('main.dg');
    await moverPin(dev, 'db', 20);
    const conDos = dev.workspace.texto('main.dg');
    const lista = await abrirHistorial();

    fireEvent.click(await within(lista).findByRole('button', { name: /mover api en mapa/ }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(conUno));
    await waitFor(() => expect(boton(lista, /mover api en mapa/).getAttribute('aria-current')).toBe('step'));
    expect(filas(lista)).toHaveLength(3);
    expect(filas(lista)[0]?.getAttribute('data-futuro')).toBe('true');

    fireEvent.click(boton(lista, /Inicio/));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL));
    fireEvent.click(boton(lista, /mover db en mapa/));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(conDos));
  });

  it('tras una escritura externa, las entradas que restaurarian el archivo quedan deshabilitadas con el motivo', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL });
    await moverPin(dev, 'api', 10);
    const lista = await abrirHistorial();
    await waitFor(() => expect(filas(lista)).toHaveLength(2));

    dev.editarFuera('main.dg', `${dev.workspace.texto('main.dg')}\n// fuera\n`);
    await waitFor(() => expect(boton(lista, /Inicio/).disabled).toBe(true));
    expect(filas(lista)[1]?.textContent).toMatch(/main\.dg.*cambio fuera de dev/);
    expect(boton(lista, /mover api en mapa/).disabled).toBe(false);
  });

  it('antes de saltar se vacia el guardado pendiente del editor', async () => {
    const posts: string[] = [];
    const envolverFetch: OpcionesDeMontaje['envolverFetch'] = (f) =>
      (async (entrada: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'POST') posts.push(String(entrada));
        return f(entrada, init);
      }) as typeof fetch;
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    await moverPin(dev, 'api', 10);
    const lista = await abrirHistorial();
    fireEvent.click(await screen.findByRole('tab', { name: 'Codigo' }));
    const caja = await screen.findByRole('textbox', { name: /^Codigo de main\.dg/ });
    const vista = EditorView.findFromDOM(caja)!;
    await waitFor(() => expect(vista.state.doc.toString()).toBe(dev.workspace.texto('main.dg')));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vista.dispatch({ changes: { from: vista.state.doc.length, insert: '// pendiente\n' }, userEvent: 'input.type' });
    fireEvent.click(boton(lista, /Inicio/));
    vi.useRealTimers();

    await waitFor(() => expect(posts).toEqual(['/api/edit', '/api/historial/saltar']));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL));
    await waitFor(() => expect(boton(lista, /texto de main\.dg/)).toBeDefined());
  });
});
