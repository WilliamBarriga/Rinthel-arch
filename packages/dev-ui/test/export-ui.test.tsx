// @vitest-environment jsdom
/**
 * Export mode of the Dev UI (`diagrams export`): the same app over the read-only client, fed with the data captured
 * from the in-memory `dev`. Writing panels are hidden; navigation, Steps, Drill-down and Theme switching still work.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canvasReady, mountExport, pressNode } from './ui-helpers';

afterEach(cleanup);

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  servicio cola "Cola"
  api -> db "lee"
  db -> cola "publica"
}

view mapa {
  type architecture
  include **
  link api -> detalle
  steps {
    step "Entrada" { show api }
    step "Datos" { show db }
  }
}

view detalle {
  type flow
  include api
}

theme oscuro extends neutral {
  palette { noche "#102030" }
  tokens { background "#102030" }
}
`;

const canvasBackground = (container: HTMLElement, view: string): string => container.querySelector<HTMLElement>(`.rd-vista[data-vista="${view}"]`)?.style.getPropertyValue('--rd-fondo') ?? '';

describe('export mode', () => {
  it('hides the writing panels and keeps only Views and Themes, marked as read-only', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    expect(within(screen.getByRole('tablist', { name: 'Left panel' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Views']);
    expect(within(screen.getByRole('tablist', { name: 'Right panel' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Themes']);
    expect(screen.getByRole('tab', { name: 'Themes' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Read-only')).toBeTruthy();
  });

  it('the Finder and the shortcuts list no writing commands', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const finder = await screen.findByRole('dialog', { name: 'Finder' });
    const entries = within(finder).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(entries.some((e) => e.includes('Open Themes'))).toBe(true);
    for (const hidden of ['Undo', 'Redo', 'Open Code', 'Save the text', 'Open Undo history', 'Open Agent', 'Follow the agent', 'Open Details', 'Open Issues']) expect(entries.some((e) => e.startsWith(hidden))).toBe(false);
  });

  it('navigates between Views from the index and by Drill-down', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    fireEvent.click(screen.getByRole('option', { name: 'detalle' }));
    await canvasReady(container, 'detalle');
    expect(window.location.hash).toBe('#view=detalle');

    fireEvent.click(screen.getByRole('option', { name: 'mapa' }));
    await canvasReady(container, 'mapa');
    pressNode(container, 'api');
    await canvasReady(container, 'detalle');
  });

  it('Steps advance on the canvas', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    const steps = container.querySelector<HTMLElement>('[data-pasos]')!;
    const text = (): string => steps.querySelector('span')?.textContent ?? '';
    const before = text();

    fireEvent.click(within(steps).getAllByRole('button').at(-1)!);

    await waitFor(() => expect(text()).not.toBe(before));
    expect(text()).toContain('Entrada');
  });

  it('switching Theme previews it with its extends chain, without offering to pin it', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    const original = canvasBackground(container, 'mapa');

    fireEvent.click(within(screen.getByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'oscuro' }));

    const card = await screen.findByRole('region', { name: 'Theme oscuro' });
    expect(await within(card).findByText('oscuro > neutral')).toBeTruthy();
    await waitFor(() => expect(canvasBackground(container, 'mapa')).toBe('#102030'));
    expect(original).not.toBe('#102030');
    expect(within(card).queryByRole('button', { name: /^Pin/ })).toBeNull();
  });

  it('selecting a Node keeps the Themes panel (there is no Details panel to open)', async () => {
    const { container } = await mountExport({ 'main.dg': DSL.replace('link api -> detalle', '') }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    pressNode(container, 'db');

    await waitFor(() => expect(window.location.hash).toContain('db'));
    expect(screen.getByRole('tab', { name: 'Themes' }).getAttribute('aria-selected')).toBe('true');
  });
});
