// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lienzoListo, montarEstudio } from './ayudas-de-ui';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  servicio cola "Cola"
  api -> db "lee"
}

view mapa {
  type architecture
  include api, db
  theme claro
}

view detalle {
  type flow
  include api
}

view otra {
  type architecture
  include db, cola
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const resaltado = () => screen.getByRole('status', { name: 'Canvas highlight' });
const opcionDeVista = (vista: string) => within(screen.getByRole('listbox', { name: 'Views' })).getByRole('option', { name: vista });
const marcada = (opcion: HTMLElement) => within(opcion).queryByRole('img', { name: 'external change' }) !== null;

async function abrir(hash = '#vista=mapa') {
  const montado = await montarEstudio({ 'main.dg': DSL }, { hash });
  await lienzoListo(montado.contenedor, hash.slice('#vista='.length));
  return montado;
}

describe('Diferencia externa en la pagina', () => {
  it('lo cambiado por fuera se resalta en el lienzo unos 5 s y marca en el indice las otras Vistas que lo muestran', async () => {
    const { dev } = await abrir();
    act(() => dev.editarFuera('main.dg', DSL.replace('"Base de datos"', '"Datos"')));

    await waitFor(() => expect(within(resaltado()).getByText('db')).toBeTruthy());
    expect(marcada(opcionDeVista('otra'))).toBe(true);
    expect(marcada(opcionDeVista('detalle'))).toBe(false);
    expect(marcada(opcionDeVista('mapa'))).toBe(false);

    act(() => void vi.advanceTimersByTime(5100));
    await waitFor(() => expect(within(resaltado()).queryByText('db')).toBeNull());
    expect(marcada(opcionDeVista('otra'))).toBe(true);

    fireEvent.click(opcionDeVista('otra'));
    await waitFor(() => expect(marcada(opcionDeVista('otra'))).toBe(false));
  });

  it('una rafaga se une y cada elemento reinicia su tiempo', async () => {
    const { dev } = await abrir();
    act(() => dev.editarFuera('main.dg', DSL.replace('"Base de datos"', '"Datos"')));
    await waitFor(() => expect(within(resaltado()).getByText('db')).toBeTruthy());
    act(() => void vi.advanceTimersByTime(3000));
    act(() => dev.editarFuera('main.dg', DSL.replace('"Base de datos"', '"Datos"').replace('"API"', '"API 2"')));
    await waitFor(() => expect(within(resaltado()).getByText('api')).toBeTruthy());

    act(() => void vi.advanceTimersByTime(2500));
    await waitFor(() => expect(within(resaltado()).queryByText('db')).toBeNull());
    expect(within(resaltado()).getByText('api')).toBeTruthy();
  });

  it('las escrituras propias de la UI no se resaltan', async () => {
    const { dev } = await abrir();
    const r = await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ tipo: 'mover-pin', vista: 'mapa', nodo: 'db', x: 10, y: 10 }) });
    expect(r.status).toBe(200);
    await dev.asentado();
    act(() => void vi.advanceTimersByTime(100));

    expect(within(resaltado()).queryAllByRole('listitem')).toEqual([]);
    expect(marcada(opcionDeVista('otra'))).toBe(false);
  });

  it('lo quitado por fuera se lista en el panel Agente hasta la siguiente Diferencia externa', async () => {
    const { dev } = await abrir();
    fireEvent.click(await screen.findByRole('tab', { name: 'Agent' }));
    act(() => dev.editarFuera('main.dg', DSL.replace('  servicio cola "Cola"\n', '').replace('include db, cola', 'include db')));

    const quitado = await screen.findByRole('list', { name: 'Removed externally' });
    expect(within(quitado).getByText('cola')).toBeTruthy();
    act(() => dev.editarFuera('main.dg', DSL.replace('  servicio cola "Cola"\n', '').replace('include db, cola', 'include db').replace('"API"', '"API 2"')));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Removed externally' })).toBeNull());
  });

  it('un cambio de Tema marca la galeria y, si es el de la Vista activa, avisa en el marco', async () => {
    const { dev } = await abrir();
    act(() => dev.editarFuera('main.dg', DSL.replace('#0ea5e9', '#f43f5e')));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('claro'));
    fireEvent.click(screen.getByRole('tab', { name: 'Themes' }));
    const opcion = within(screen.getByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'claro' });
    expect(marcada(opcion)).toBe(true);
  });

  it('con "seguir al agente", una Diferencia sin Evento no mueve la Vista: solo marca el indice', async () => {
    const { dev } = await abrir('#vista=detalle');
    fireEvent.click(screen.getByRole('switch', { name: 'Follow the agent' }));
    act(() => dev.editarFuera('main.dg', DSL.replace('"Cola"', '"Cola nueva"')));

    await waitFor(() => expect(marcada(opcionDeVista('otra'))).toBe(true));
    await act(async () => new Promise((r) => setTimeout(r, 1200)));
    expect(window.location.hash).toBe('#vista=detalle');
  });
});
