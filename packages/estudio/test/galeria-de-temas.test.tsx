// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { lienzoListo, montarEstudio } from './ayudas-de-ui';

afterEach(cleanup);

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

theme oscuro extends neutral {
  palette { noche "#102030" }
  tokens { background "#102030" }
}
`;

/** Un Tema de `--theme-path` (solo lectura). */
const PRESTADO = `theme prestado extends oscuro {
  palette { pizarra "#405060" }
  tokens { background "#405060" }
}
`;

const fondoDelLienzo = (contenedor: HTMLElement): string => contenedor.querySelector<HTMLElement>('.rd-vista[data-vista="mapa"]')?.style.getPropertyValue('--rd-fondo') ?? '';

/** Espera al lienzo (antes, el marco sin Fuente se reemplaza y la pestana elegida se pierde) y abre la galeria. */
async function abrirGaleria(contenedor: HTMLElement): Promise<HTMLElement> {
  await lienzoListo(contenedor, 'mapa');
  fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
  return screen.findByRole('listbox', { name: 'Themes' });
}

describe('galeria de Temas', () => {
  it('lista los Temas de la Fuente (incluidos los de --theme-path) y marca el fijado en la Vista activa', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL.replace('include **', 'include **\n  theme oscuro') }, { hash: '#vista=mapa', temas: { 'prestados/prestado.dg': PRESTADO } });
    const galeria = await abrirGaleria(contenedor);

    const nombres = within(galeria).getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(nombres).toEqual(expect.arrayContaining(['neutral', 'oscuro', 'prestado']));
    expect(within(galeria).getByRole('option', { name: 'oscuro' }).textContent).toContain('pinned');
  });

  it('elegir un Tema muestra su cadena extends, su Paleta y sus Capas y previsualiza la Vista activa sin escribir', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', temas: { 'prestados/prestado.dg': PRESTADO } });
    const galeria = await abrirGaleria(contenedor);
    const fondoOriginal = fondoDelLienzo(contenedor);

    fireEvent.click(within(galeria).getByRole('option', { name: 'prestado' }));

    const ficha = await screen.findByRole('region', { name: 'Theme prestado' });
    expect(await within(ficha).findByText('prestado > oscuro > neutral')).toBeTruthy();
    expect(within(within(ficha).getByRole('list', { name: 'Palette' })).getByText('pizarra').closest('li')?.textContent).toContain('#405060');
    expect(within(within(ficha).getByRole('list', { name: 'Layers' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    await waitFor(() => expect(fondoDelLienzo(contenedor)).toBe('#405060'));
    expect(fondoOriginal).not.toBe('#405060');
    expect(dev.workspace.texto('main.dg')).toBe(DSL);

    fireEvent.click(within(ficha).getByRole('button', { name: 'Stop previewing' }));
    await waitFor(() => expect(fondoDelLienzo(contenedor)).toBe(fondoOriginal));
  });

  it('se recorre con las flechas y Enter elige el Tema, como el indice de Vistas', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', temas: { 'prestados/prestado.dg': PRESTADO } });
    const galeria = await abrirGaleria(contenedor);
    const nombres = within(galeria).getAllByRole('option').map((o) => o.getAttribute('aria-label') ?? '');
    const activa = (): string | null | undefined => {
      const id = galeria.getAttribute('aria-activedescendant');
      return id === null ? null : document.getElementById(id)?.getAttribute('aria-label');
    };

    fireEvent.keyDown(galeria, { key: 'ArrowDown' });
    expect(activa()).toBe(nombres[0]);
    fireEvent.keyDown(galeria, { key: 'ArrowDown' });
    expect(activa()).toBe(nombres[1]);
    // Moverse no elige: la ficha aparece al pulsar Enter.
    expect(screen.queryByRole('region', { name: `Theme ${nombres[1]}` })).toBeNull();
    fireEvent.keyDown(galeria, { key: 'Enter' });
    expect(await screen.findByRole('region', { name: `Theme ${nombres[1]}` })).toBeTruthy();
    expect(within(galeria).getByRole('option', { name: nombres[1] }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(galeria, { key: 'End' });
    expect(activa()).toBe(nombres[nombres.length - 1]);
    fireEvent.keyDown(galeria, { key: 'Home' });
    expect(activa()).toBe(nombres[0]);
    fireEvent.keyDown(galeria, { key: 'ArrowUp' });
    expect(activa()).toBe(nombres[0]);
  });

  it('fijar escribe theme en la Vista activa y quitar lo borra', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa' });
    const galeria = await abrirGaleria(contenedor);

    fireEvent.click(within(galeria).getByRole('option', { name: 'oscuro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pin oscuro to mapa' }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL.replace('view mapa {\n', 'view mapa {\n  theme oscuro\n')));
    await waitFor(() => expect(within(galeria).getByRole('option', { name: 'oscuro' }).textContent).toContain('pinned'));

    fireEvent.click(screen.getByRole('button', { name: 'Unpin the Theme of mapa' }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL));
  });
});
