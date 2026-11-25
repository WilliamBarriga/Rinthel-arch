// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { lienzoListo, montarEstudio, pulsarNodo } from './ayudas-de-ui';

afterEach(cleanup);

/** Ancho minimo que pide la isla izquierda al abrir el editor. */
const ANCHO_DEL_EDITOR_PX = 560;

const DSL = `specification {
  node servicio
}

model {
  servicio api "API" "Puerta de entrada"
  servicio db "Base de datos" "Guarda las cuentas"
  api -> db "lee"
  interaction login "Login" {
    api -> db "consulta"
  }
}

view mapa {
  type architecture
  include **
  link api -> detalle
}

view detalle {
  type flow
  include api
}

view flujo {
  type sequence
  interaction login
}

view otra {
  type architecture
  include db
  link db -> mapa
}
`;

const opcion = (nombre: string) => screen.getByRole('option', { name: nombre });

describe('marco de la UI', () => {
  it('isla izquierda con Vistas y Codigo, isla derecha con Detalle, Issues, Temas, Historial y Agente', async () => {
    await montarEstudio({ 'main.dg': DSL });

    const izquierda = await screen.findByRole('tablist', { name: 'Left panel' });
    expect(within(izquierda).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Views', 'Code']);
    const derecha = screen.getByRole('tablist', { name: 'Right panel' });
    expect(within(derecha).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Issues', 'Themes', 'Undo history', 'Agent']);
    expect(screen.getByRole('tab', { name: 'Views' }).getAttribute('aria-selected')).toBe('true');
  });

  it('las islas se ocultan y se recuperan desde la pestana del borde', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });

    fireEvent.click(screen.getByRole('button', { name: 'Hide left panel' }));
    expect(screen.queryByRole('listbox', { name: 'Views' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show left panel' }));
    expect(screen.getByRole('listbox', { name: 'Views' })).toBeTruthy();
  });

  it('el ancho y el alto de una isla se cambian con el teclado del separador; doble clic vuelve al alto del contenido', async () => {
    await montarEstudio({ 'main.dg': DSL });
    const ancho = await screen.findByRole('separator', { name: 'Width of the left panel' });
    const antes = Number(ancho.getAttribute('aria-valuenow'));

    fireEvent.keyDown(ancho, { key: 'ArrowRight' });
    expect(Number(ancho.getAttribute('aria-valuenow'))).toBe(antes + 16);
    fireEvent.keyDown(ancho, { key: 'Home' });
    expect(ancho.getAttribute('aria-valuenow')).toBe(ancho.getAttribute('aria-valuemin'));

    const alto = screen.getByRole('separator', { name: 'Height of the left panel' });
    expect(alto.getAttribute('aria-valuetext')).toBe('content height');
    fireEvent.keyDown(alto, { key: 'End' });
    expect(alto.getAttribute('aria-valuenow')).toBe(alto.getAttribute('aria-valuemax'));
    fireEvent.doubleClick(alto);
    expect(alto.getAttribute('aria-valuetext')).toBe('content height');
  });

  it('abrir Codigo ensancha la isla izquierda para que el editor no corte el texto (sin pasar del maximo)', async () => {
    await montarEstudio({ 'main.dg': DSL });
    const ancho = await screen.findByRole('separator', { name: 'Width of the left panel' });
    const antes = Number(ancho.getAttribute('aria-valuenow'));

    fireEvent.click(await screen.findByRole('tab', { name: 'Code' }));

    const maximo = Number(ancho.getAttribute('aria-valuemax'));
    await waitFor(() => expect(Number(ancho.getAttribute('aria-valuenow'))).toBe(Math.min(Math.max(antes, ANCHO_DEL_EDITOR_PX), maximo)));
    expect(Number(ancho.getAttribute('aria-valuenow'))).toBeGreaterThan(antes);
  });
});

describe('vidrio durante un gesto', () => {
  it('mientras se arrastra o se hace zoom en el lienzo el chrome usa superficie solida (costo de backdrop-filter)', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    const lienzo = screen.getByRole('main', { name: 'Canvas' });
    // El gesto marca `data-arrastrando` en la raiz del chrome, que contiene las islas.
    const solido = (): boolean => screen.getByRole('complementary', { name: 'Left panel' }).closest('[data-arrastrando]') !== null;

    fireEvent.pointerDown(lienzo);
    expect(solido()).toBe(true);
    fireEvent.pointerUp(lienzo);
    expect(solido()).toBe(false);

    fireEvent.wheel(lienzo);
    expect(solido()).toBe(true);
    await waitFor(() => expect(solido()).toBe(false));
  });
});

describe('indice de Vistas', () => {
  it('agrupa las Vistas por Tipo de diagrama, marca la activa y muestra los Enlaces', async () => {
    await montarEstudio({ 'main.dg': DSL });

    const indice = await screen.findByRole('listbox', { name: 'Views' });
    expect(within(indice).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['architecture', 'flow', 'sequence']);
    expect(within(screen.getByRole('group', { name: 'architecture' })).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['mapa', 'otra']);
    expect(opcion('mapa').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'mapa', description: 'links to detalle; linked from otra' })).toBeTruthy();
  });

  it('elegir una Vista cambia el lienzo y la URL a #view=<id>; atras en el navegador vuelve', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');

    fireEvent.click(await screen.findByRole('option', { name: 'detalle' }));

    await lienzoListo(contenedor, 'detalle');
    expect(window.location.hash).toBe('#view=detalle');
    expect(opcion('detalle').getAttribute('aria-selected')).toBe('true');

    act(() => window.history.back());
    await waitFor(() => expect(opcion('mapa').getAttribute('aria-selected')).toBe('true'));
    await lienzoListo(contenedor, 'mapa');
  });

  it('se recorre con las flechas: cada flecha abre la Vista siguiente o anterior', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    const indice = await screen.findByRole('listbox', { name: 'Views' });

    fireEvent.keyDown(indice, { key: 'ArrowDown' });
    await waitFor(() => expect(opcion('otra').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(indice, { key: 'ArrowDown' });
    await waitFor(() => expect(opcion('detalle').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(indice, { key: 'ArrowUp' });
    await waitFor(() => expect(opcion('otra').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(indice, { key: 'End' });
    await waitFor(() => expect(opcion('flujo').getAttribute('aria-selected')).toBe('true'));
    await lienzoListo(contenedor, 'flujo');
  });

  it('abre la Vista que nombra la URL', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=otra' });

    await lienzoListo(contenedor, 'otra');
    expect(opcion('otra').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Detalle', () => {
  it('clic en un Nodo abre Detalle con lo que da inspect node', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));

    pulsarNodo(contenedor, 'db');
    await waitFor(() => expect(window.location.hash).toContain('s=db'));

    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
    const detalle = screen.getByRole('region', { name: 'Details' });
    expect(await within(detalle).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
    expect(within(detalle).getByText('Guarda las cuentas')).toBeTruthy();
    expect(within(detalle).getByText('main.dg:7')).toBeTruthy();
    expect(within(detalle).getByRole('list', { name: 'Edges' }).textContent).toBe('<- api "lee"');
    // Desde el Detalle se salta a otra Vista que contiene el Nodo.
    const vistas = within(detalle).getByRole('list', { name: 'Views of the Node' });
    expect(within(vistas).getAllByRole('button').map((b) => b.textContent)).toEqual(['mapa', 'flujo', 'otra']);
    fireEvent.click(within(vistas).getByRole('button', { name: 'otra' }));
    await lienzoListo(contenedor, 'otra');
  });

  it('sin seleccion, el Detalle lo dice', async () => {
    await montarEstudio({ 'main.dg': DSL });

    fireEvent.click(await screen.findByRole('tab', { name: 'Details' }));

    expect(within(screen.getByRole('region', { name: 'Details' })).getByText(/Select a Node/)).toBeTruthy();
  });
});
