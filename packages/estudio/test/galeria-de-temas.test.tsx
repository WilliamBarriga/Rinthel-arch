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
  fireEvent.click(await screen.findByRole('tab', { name: 'Temas' }));
  return screen.findByRole('listbox', { name: 'Temas' });
}

describe('galeria de Temas', () => {
  it('lista los Temas de la Fuente (incluidos los de --theme-path) y marca el fijado en la Vista activa', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL.replace('include **', 'include **\n  theme oscuro') }, { hash: '#vista=mapa', temas: { 'prestados/prestado.dg': PRESTADO } });
    const galeria = await abrirGaleria(contenedor);

    const nombres = within(galeria).getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(nombres).toEqual(expect.arrayContaining(['neutral', 'oscuro', 'prestado']));
    expect(within(galeria).getByRole('option', { name: 'oscuro' }).textContent).toContain('fijado');
  });

  it('elegir un Tema muestra su cadena extends, su Paleta y sus Capas y previsualiza la Vista activa sin escribir', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', temas: { 'prestados/prestado.dg': PRESTADO } });
    const galeria = await abrirGaleria(contenedor);
    const fondoOriginal = fondoDelLienzo(contenedor);

    fireEvent.click(within(galeria).getByRole('option', { name: 'prestado' }));

    const ficha = await screen.findByRole('region', { name: 'Tema prestado' });
    expect(await within(ficha).findByText('prestado > oscuro > neutral')).toBeTruthy();
    expect(within(within(ficha).getByRole('list', { name: 'Paleta' })).getByText('pizarra').closest('li')?.textContent).toContain('#405060');
    expect(within(within(ficha).getByRole('list', { name: 'Capas' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    await waitFor(() => expect(fondoDelLienzo(contenedor)).toBe('#405060'));
    expect(fondoOriginal).not.toBe('#405060');
    expect(dev.workspace.texto('main.dg')).toBe(DSL);

    fireEvent.click(within(ficha).getByRole('button', { name: 'Dejar de previsualizar' }));
    await waitFor(() => expect(fondoDelLienzo(contenedor)).toBe(fondoOriginal));
  });

  it('fijar escribe theme en la Vista activa y quitar lo borra', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa' });
    const galeria = await abrirGaleria(contenedor);

    fireEvent.click(within(galeria).getByRole('option', { name: 'oscuro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fijar oscuro en mapa' }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL.replace('view mapa {\n', 'view mapa {\n  theme oscuro\n')));
    await waitFor(() => expect(within(galeria).getByRole('option', { name: 'oscuro' }).textContent).toContain('fijado'));

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el Tema fijado de mapa' }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL));
  });
});
