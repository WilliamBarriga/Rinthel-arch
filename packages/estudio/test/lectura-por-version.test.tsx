// @vitest-environment jsdom
/**
 * Lectura por version en la app montada: Detalle y la ficha de Tema releen con cada version, una respuesta vieja que
 * llega tarde no pisa la nueva y los dos muestran los mismos estados de carga y fallo.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DSL_BASICO, lienzoListo, montarEstudio, pulsarNodo } from './ayudas-de-ui';
import type { OpcionesDeMontaje } from './ayudas-de-ui';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const DSL = `${DSL_BASICO}
theme oscuro extends neutral {
  tokens { background "#102030" }
}
`;

const RETRASO_MS = 1000;

/** Las peticiones cuya ruta contiene `fragmento` tardan `RETRASO_MS` (con `setTimeout`, falso en la prueba). */
function retrasar(fragmento: string): NonNullable<OpcionesDeMontaje['envolverFetch']> {
  return (f) =>
    (async (entrada: string | URL | Request, init?: RequestInit) => {
      if (String(entrada).includes(fragmento)) await new Promise((r) => setTimeout(r, RETRASO_MS));
      return f(entrada, init);
    }) as typeof fetch;
}

/** Tras dar por llegada la respuesta retrasada, vuelve a los timers reales para esperar con `findBy*`. */
async function dejarLlegarLaVieja(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(RETRASO_MS));
  vi.useRealTimers();
}

describe('respuestas viejas', () => {
  it('en Detalle, la de un Nodo que se dejo de seleccionar no pisa la del Nodo nuevo', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', envolverFetch: retrasar('/api/inspect/nodo/api') });
    await lienzoListo(contenedor, 'mapa');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pulsarNodo(contenedor, 'api');
    pulsarNodo(contenedor, 'db');
    await dejarLlegarLaVieja();

    const detalle = screen.getByRole('region', { name: 'Details' });
    expect(await within(detalle).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
    expect(within(detalle).queryByRole('heading', { name: 'API' })).toBeNull();
  });

  it('en la ficha de Tema, la del Tema elegido antes no pisa la del elegido despues', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', envolverFetch: retrasar('/api/inspect/tema/oscuro') });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    const galeria = await screen.findByRole('listbox', { name: 'Themes' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(galeria).getByRole('option', { name: 'oscuro' }));
    fireEvent.click(within(galeria).getByRole('option', { name: 'neutral' }));
    await dejarLlegarLaVieja();

    const ficha = screen.getByRole('region', { name: 'Theme neutral' });
    await waitFor(() => expect(within(ficha).queryByRole('status')).toBeNull());
    // `neutral` no extiende a nadie: la cadena de `oscuro` (`neutral`) no debe aparecer detras de su nombre.
    expect(within(ficha).getByRole('heading', { name: 'Extends chain' }).nextElementSibling?.textContent).toBe('neutral');
  });
});

describe('estados de carga y fallo', () => {
  it('Detalle anuncia la carga y el fallo por rol: un Nodo borrado por fuera muestra el mensaje de inspect', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa' });
    await lienzoListo(contenedor, 'mapa');
    pulsarNodo(contenedor, 'db');
    const detalle = screen.getByRole('region', { name: 'Details' });
    expect(await within(detalle).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();

    dev.editarFuera('main.dg', DSL.replace('  servicio db "Base de datos"\n', '').replace('  api -> db "lee"\n', ''));
    await dev.asentado();

    expect((await within(detalle).findByRole('status')).textContent).toContain("No existe el Nodo 'db'");
    expect(within(detalle).queryByRole('heading', { name: 'Base de datos' })).toBeNull();
  });

  it('la ficha de Tema anuncia la carga y el fallo por rol igual que Detalle', async () => {
    const caido: NonNullable<OpcionesDeMontaje['envolverFetch']> = (f) =>
      (async (entrada: string | URL | Request, init?: RequestInit) => {
        if (String(entrada).includes('/api/inspect/tema/')) throw new Error('Sin red');
        return f(entrada, init);
      }) as typeof fetch;
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', envolverFetch: caido });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'oscuro' }));

    const ficha = screen.getByRole('region', { name: 'Theme oscuro' });
    expect(within(ficha).getByRole('status').textContent).toBe('Loading oscuro...');
    await waitFor(() => expect(within(ficha).getByRole('status').textContent).toBe('Sin red'));
  });
});
