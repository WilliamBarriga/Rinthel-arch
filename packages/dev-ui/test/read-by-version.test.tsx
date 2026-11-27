// @vitest-environment jsdom
/**
 * Read by version in the mounted app: Details and the Theme card read again with each version, a stale response
 * that arrives late does not overwrite the new one and both show the same loading and failure states.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASIC_DSL, canvasReady, mountDevUi, pressNode } from './ui-helpers';
import type { MountOptions } from './ui-helpers';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const DSL = `${BASIC_DSL}
theme oscuro extends neutral {
  tokens { background "#102030" }
}
`;

const DELAY_MS = 1000;

/** Requests whose route contains `fragment` take `DELAY_MS` (with `setTimeout`, fake in the test). */
function delay(fragment: string): NonNullable<MountOptions['wrapFetch']> {
  return (f) =>
    (async (entry: string | URL | Request, init?: RequestInit) => {
      if (String(entry).includes(fragment)) await new Promise((r) => setTimeout(r, DELAY_MS));
      return f(entry, init);
    }) as typeof fetch;
}

/** After letting the delayed response arrive, goes back to real timers to wait with `findBy*`. */
async function letOldArrive(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(DELAY_MS));
  vi.useRealTimers();
}

describe('stale responses', () => {
  it('in Details, the one of a Node no longer selected does not overwrite the new Node', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', wrapFetch: delay('/api/inspect/node/api') });
    await canvasReady(container, 'mapa');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pressNode(container, 'api');
    pressNode(container, 'db');
    await letOldArrive();

    const detail = screen.getByRole('region', { name: 'Details' });
    expect(await within(detail).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
    expect(within(detail).queryByRole('heading', { name: 'API' })).toBeNull();
  });

  it('in the Theme card, the one of the Theme chosen before does not overwrite the one chosen after', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', wrapFetch: delay('/api/inspect/theme/oscuro') });
    await canvasReady(container, 'mapa');
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    const gallery = await screen.findByRole('listbox', { name: 'Themes' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(gallery).getByRole('option', { name: 'oscuro' }));
    fireEvent.click(within(gallery).getByRole('option', { name: 'neutral' }));
    await letOldArrive();

    const card = screen.getByRole('region', { name: 'Theme neutral' });
    await waitFor(() => expect(within(card).queryByRole('status')).toBeNull());
    // `neutral` extends nothing: the chain of `oscuro` (`neutral`) must not appear behind its name.
    expect(within(card).getByRole('heading', { name: 'Extends chain' }).nextElementSibling?.textContent).toBe('neutral');
  });
});

describe('loading and failure states', () => {
  it('Details announces loading and failure by role: a Node deleted outside shows the inspect message', async () => {
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    pressNode(container, 'db');
    const detail = screen.getByRole('region', { name: 'Details' });
    expect(await within(detail).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();

    dev.editOutside('main.dg', DSL.replace('  servicio db "Base de datos"\n', '').replace('  api -> db "lee"\n', ''));
    await dev.settled();

    expect((await within(detail).findByRole('status')).textContent).toContain("No such Node 'db'");
    expect(within(detail).queryByRole('heading', { name: 'Base de datos' })).toBeNull();
  });

  it('the Theme card announces loading and failure by role like Details', async () => {
    const down: NonNullable<MountOptions['wrapFetch']> = (f) =>
      (async (entry: string | URL | Request, init?: RequestInit) => {
        if (String(entry).includes('/api/inspect/theme/')) throw new Error('No network');
        return f(entry, init);
      }) as typeof fetch;
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', wrapFetch: down });
    await canvasReady(container, 'mapa');
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'oscuro' }));

    const card = screen.getByRole('region', { name: 'Theme oscuro' });
    expect(within(card).getByRole('status').textContent).toBe('Loading oscuro...');
    await waitFor(() => expect(within(card).getByRole('status').textContent).toBe('No network'));
  });
});
