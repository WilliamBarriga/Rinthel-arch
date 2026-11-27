// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canvasReady, mountDevUi, pressNode } from './ui-helpers';

afterEach(cleanup);

/** Minimum width the left island asks for when the editor opens. */
const EDITOR_WIDTH_PX = 560;

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

const option = (name: string) => screen.getByRole('option', { name });

describe('UI frame', () => {
  it('left island with Views and Code, right island with Details, Issues, Themes, Undo history and Agent', async () => {
    await mountDevUi({ 'main.dg': DSL });

    const left = await screen.findByRole('tablist', { name: 'Left panel' });
    expect(within(left).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Views', 'Code']);
    const right = screen.getByRole('tablist', { name: 'Right panel' });
    expect(within(right).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Issues', 'Themes', 'Undo history', 'Agent']);
    expect(screen.getByRole('tab', { name: 'Views' }).getAttribute('aria-selected')).toBe('true');
  });

  it('the islands hide and come back from the edge tab', async () => {
    await mountDevUi({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });

    fireEvent.click(screen.getByRole('button', { name: 'Hide left panel' }));
    expect(screen.queryByRole('listbox', { name: 'Views' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show left panel' }));
    expect(screen.getByRole('listbox', { name: 'Views' })).toBeTruthy();
  });

  it('the width and height of an island change with the separator keyboard; double click goes back to the content height', async () => {
    await mountDevUi({ 'main.dg': DSL });
    const width = await screen.findByRole('separator', { name: 'Width of the left panel' });
    const before = Number(width.getAttribute('aria-valuenow'));

    fireEvent.keyDown(width, { key: 'ArrowRight' });
    expect(Number(width.getAttribute('aria-valuenow'))).toBe(before + 16);
    fireEvent.keyDown(width, { key: 'Home' });
    expect(width.getAttribute('aria-valuenow')).toBe(width.getAttribute('aria-valuemin'));

    const height = screen.getByRole('separator', { name: 'Height of the left panel' });
    expect(height.getAttribute('aria-valuetext')).toBe('content height');
    fireEvent.keyDown(height, { key: 'End' });
    expect(height.getAttribute('aria-valuenow')).toBe(height.getAttribute('aria-valuemax'));
    fireEvent.doubleClick(height);
    expect(height.getAttribute('aria-valuetext')).toBe('content height');
  });

  it('opening Code widens the left island so the editor does not wrap the text (without exceeding the maximum)', async () => {
    await mountDevUi({ 'main.dg': DSL });
    const width = await screen.findByRole('separator', { name: 'Width of the left panel' });
    const before = Number(width.getAttribute('aria-valuenow'));

    fireEvent.click(await screen.findByRole('tab', { name: 'Code' }));

    const maximum = Number(width.getAttribute('aria-valuemax'));
    await waitFor(() => expect(Number(width.getAttribute('aria-valuenow'))).toBe(Math.min(Math.max(before, EDITOR_WIDTH_PX), maximum)));
    expect(Number(width.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  });
});

describe('glass during a gesture', () => {
  it('while dragging or zooming the canvas the chrome uses a solid surface (backdrop-filter cost)', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    const canvas = screen.getByRole('main', { name: 'Canvas' });
    // The gesture sets `data-arrastrando` on the chrome root, which contains the islands.
    const solid = (): boolean => screen.getByRole('complementary', { name: 'Left panel' }).closest('[data-arrastrando]') !== null;

    fireEvent.pointerDown(canvas);
    expect(solid()).toBe(true);
    fireEvent.pointerUp(canvas);
    expect(solid()).toBe(false);

    fireEvent.wheel(canvas);
    expect(solid()).toBe(true);
    await waitFor(() => expect(solid()).toBe(false));
  });
});

describe('View index', () => {
  it('groups the Views by Diagram type, marks the active one and shows the Links', async () => {
    await mountDevUi({ 'main.dg': DSL });

    const index = await screen.findByRole('listbox', { name: 'Views' });
    expect(within(index).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['architecture', 'flow', 'sequence']);
    expect(within(screen.getByRole('group', { name: 'architecture' })).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['mapa', 'otra']);
    expect(option('mapa').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'mapa', description: 'links to detalle; linked from otra' })).toBeTruthy();
  });

  it('choosing a View changes the canvas and the URL to #view=<id>; browser back returns', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');

    fireEvent.click(await screen.findByRole('option', { name: 'detalle' }));

    await canvasReady(container, 'detalle');
    expect(window.location.hash).toBe('#view=detalle');
    expect(option('detalle').getAttribute('aria-selected')).toBe('true');

    act(() => window.history.back());
    await waitFor(() => expect(option('mapa').getAttribute('aria-selected')).toBe('true'));
    await canvasReady(container, 'mapa');
  });

  it('arrows walk it: each arrow opens the next or previous View', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    const index = await screen.findByRole('listbox', { name: 'Views' });

    fireEvent.keyDown(index, { key: 'ArrowDown' });
    await waitFor(() => expect(option('otra').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(index, { key: 'ArrowDown' });
    await waitFor(() => expect(option('detalle').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(index, { key: 'ArrowUp' });
    await waitFor(() => expect(option('otra').getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(index, { key: 'End' });
    await waitFor(() => expect(option('flujo').getAttribute('aria-selected')).toBe('true'));
    await canvasReady(container, 'flujo');
  });

  it('opens the View the URL names', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=otra' });

    await canvasReady(container, 'otra');
    expect(option('otra').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Details', () => {
  it('clicking a Node opens Details with what inspect node gives', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL });
    await canvasReady(container, 'mapa');
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));

    pressNode(container, 'db');
    await waitFor(() => expect(window.location.hash).toContain('s=db'));

    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
    const detail = screen.getByRole('region', { name: 'Details' });
    expect(await within(detail).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
    expect(within(detail).getByText('Guarda las cuentas')).toBeTruthy();
    expect(within(detail).getByText('main.dg:7')).toBeTruthy();
    expect(within(detail).getByRole('list', { name: 'Edges' }).textContent).toBe('<- api "lee"');
    // From Details it jumps to another View that contains the Node.
    const views = within(detail).getByRole('list', { name: 'Views of the Node' });
    expect(within(views).getAllByRole('button').map((b) => b.textContent)).toEqual(['mapa', 'flujo', 'otra']);
    fireEvent.click(within(views).getByRole('button', { name: 'otra' }));
    await canvasReady(container, 'otra');
  });

  it('without a selection, Details says so', async () => {
    await mountDevUi({ 'main.dg': DSL });

    fireEvent.click(await screen.findByRole('tab', { name: 'Details' }));

    expect(within(screen.getByRole('region', { name: 'Details' })).getByText(/Select a Node/)).toBeTruthy();
  });
});
