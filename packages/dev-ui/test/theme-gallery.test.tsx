// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canvasReady, mountDevUi } from './ui-helpers';

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

/** A `--theme-path` Theme (read-only). */
const BORROWED = `theme prestado extends oscuro {
  palette { pizarra "#405060" }
  tokens { background "#405060" }
}
`;

const canvasBackground = (container: HTMLElement): string => container.querySelector<HTMLElement>('.rd-vista[data-vista="mapa"]')?.style.getPropertyValue('--rd-fondo') ?? '';

/** Waits for the canvas (before it, the frame without a Source is replaced and the chosen tab is lost) and opens the gallery. */
async function openGallery(container: HTMLElement): Promise<HTMLElement> {
  await canvasReady(container, 'mapa');
  fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
  return screen.findByRole('listbox', { name: 'Themes' });
}

describe('Theme gallery', () => {
  it('lists the Themes of the Source (including the --theme-path ones) and marks the one pinned on the active View', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL.replace('include **', 'include **\n  theme oscuro') }, { hash: '#view=mapa', themes: { 'prestados/prestado.dg': BORROWED } });
    const gallery = await openGallery(container);

    const names = within(gallery).getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(names).toEqual(expect.arrayContaining(['neutral', 'oscuro', 'prestado']));
    expect(within(gallery).getByRole('option', { name: 'oscuro' }).textContent).toContain('pinned');
  });

  it('choosing a Theme shows its extends chain, its Palette and its Layers and previews the active View without writing', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', themes: { 'prestados/prestado.dg': BORROWED } });
    const gallery = await openGallery(container);
    const originalBackground = canvasBackground(container);

    fireEvent.click(within(gallery).getByRole('option', { name: 'prestado' }));

    const card = await screen.findByRole('region', { name: 'Theme prestado' });
    expect(await within(card).findByText('prestado > oscuro > neutral')).toBeTruthy();
    expect(within(within(card).getByRole('list', { name: 'Palette' })).getByText('pizarra').closest('li')?.textContent).toContain('#405060');
    expect(within(within(card).getByRole('list', { name: 'Layers' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    await waitFor(() => expect(canvasBackground(container)).toBe('#405060'));
    expect(originalBackground).not.toBe('#405060');
    expect(dev.workspace.text('main.dg')).toBe(DSL);

    fireEvent.click(within(card).getByRole('button', { name: 'Stop previewing' }));
    await waitFor(() => expect(canvasBackground(container)).toBe(originalBackground));
  });

  it('arrows walk it and Enter chooses the Theme, like the View index', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', themes: { 'prestados/prestado.dg': BORROWED } });
    const gallery = await openGallery(container);
    const names = within(gallery).getAllByRole('option').map((o) => o.getAttribute('aria-label') ?? '');
    const active = (): string | null | undefined => {
      const id = gallery.getAttribute('aria-activedescendant');
      return id === null ? null : document.getElementById(id)?.getAttribute('aria-label');
    };

    fireEvent.keyDown(gallery, { key: 'ArrowDown' });
    expect(active()).toBe(names[0]);
    fireEvent.keyDown(gallery, { key: 'ArrowDown' });
    expect(active()).toBe(names[1]);
    // Moving does not choose: the card appears on Enter.
    expect(screen.queryByRole('region', { name: `Theme ${names[1]}` })).toBeNull();
    fireEvent.keyDown(gallery, { key: 'Enter' });
    expect(await screen.findByRole('region', { name: `Theme ${names[1]}` })).toBeTruthy();
    expect(within(gallery).getByRole('option', { name: names[1] }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(gallery, { key: 'End' });
    expect(active()).toBe(names[names.length - 1]);
    fireEvent.keyDown(gallery, { key: 'Home' });
    expect(active()).toBe(names[0]);
    fireEvent.keyDown(gallery, { key: 'ArrowUp' });
    expect(active()).toBe(names[0]);
  });

  it('pin writes theme in the active View and remove deletes it', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    const gallery = await openGallery(container);

    fireEvent.click(within(gallery).getByRole('option', { name: 'oscuro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pin oscuro to mapa' }));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL.replace('view mapa {\n', 'view mapa {\n  theme oscuro\n')));
    await waitFor(() => expect(within(gallery).getByRole('option', { name: 'oscuro' }).textContent).toContain('pinned'));

    fireEvent.click(screen.getByRole('button', { name: 'Unpin the Theme of mapa' }));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL));
  });
});
