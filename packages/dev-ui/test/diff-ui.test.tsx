// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasReady, mountDevUi } from './ui-helpers';

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

const highlight = () => screen.getByRole('status', { name: 'Canvas highlight' });
const viewOption = (view: string) => within(screen.getByRole('listbox', { name: 'Views' })).getByRole('option', { name: view });
const marked = (option: HTMLElement) => within(option).queryByRole('img', { name: 'external change' }) !== null;

async function open(hash = '#view=mapa') {
  const mounted = await mountDevUi({ 'main.dg': DSL }, { hash });
  await canvasReady(mounted.container, hash.slice('#view='.length));
  return mounted;
}

describe('external Diff in the page', () => {
  it('what changed outside is highlighted on the canvas for about 5 s and marks in the index the other Views that show it', async () => {
    const { dev } = await open();
    act(() => dev.editOutside('main.dg', DSL.replace('"Base de datos"', '"Datos"')));

    await waitFor(() => expect(within(highlight()).getByText('db')).toBeTruthy());
    expect(marked(viewOption('otra'))).toBe(true);
    expect(marked(viewOption('detalle'))).toBe(false);
    expect(marked(viewOption('mapa'))).toBe(false);

    act(() => void vi.advanceTimersByTime(5100));
    await waitFor(() => expect(within(highlight()).queryByText('db')).toBeNull());
    expect(marked(viewOption('otra'))).toBe(true);

    fireEvent.click(viewOption('otra'));
    await waitFor(() => expect(marked(viewOption('otra'))).toBe(false));
  });

  it('a burst merges and each element restarts its time', async () => {
    const { dev } = await open();
    act(() => dev.editOutside('main.dg', DSL.replace('"Base de datos"', '"Datos"')));
    await waitFor(() => expect(within(highlight()).getByText('db')).toBeTruthy());
    act(() => void vi.advanceTimersByTime(3000));
    act(() => dev.editOutside('main.dg', DSL.replace('"Base de datos"', '"Datos"').replace('"API"', '"API 2"')));
    await waitFor(() => expect(within(highlight()).getByText('api')).toBeTruthy());

    act(() => void vi.advanceTimersByTime(2500));
    await waitFor(() => expect(within(highlight()).queryByText('db')).toBeNull());
    expect(within(highlight()).getByText('api')).toBeTruthy();
  });

  it('the UI own writes are not highlighted', async () => {
    const { dev } = await open();
    const r = await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'db', x: 10, y: 10 }) });
    expect(r.status).toBe(200);
    await dev.settled();
    act(() => void vi.advanceTimersByTime(100));

    expect(within(highlight()).queryAllByRole('listitem')).toEqual([]);
    expect(marked(viewOption('otra'))).toBe(false);
  });

  it('what was removed outside is listed in the Agent panel until the next external Diff', async () => {
    const { dev } = await open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Agent' }));
    act(() => dev.editOutside('main.dg', DSL.replace('  servicio cola "Cola"\n', '').replace('include db, cola', 'include db')));

    const removed = await screen.findByRole('list', { name: 'Removed externally' });
    expect(within(removed).getByText('cola')).toBeTruthy();
    act(() => dev.editOutside('main.dg', DSL.replace('  servicio cola "Cola"\n', '').replace('include db, cola', 'include db').replace('"API"', '"API 2"')));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Removed externally' })).toBeNull());
  });

  it('a Theme change marks the gallery and, if it is the active View one, notifies in the frame', async () => {
    const { dev } = await open();
    act(() => dev.editOutside('main.dg', DSL.replace('#0ea5e9', '#f43f5e')));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('claro'));
    fireEvent.click(screen.getByRole('tab', { name: 'Themes' }));
    const option = within(screen.getByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'claro' });
    expect(marked(option)).toBe(true);
  });

  it('with "follow the agent", a Diff without an Event does not move the View: it only marks the index', async () => {
    const { dev } = await open('#view=detalle');
    fireEvent.click(screen.getByRole('switch', { name: 'Follow the agent' }));
    act(() => dev.editOutside('main.dg', DSL.replace('"Cola"', '"Cola nueva"')));

    await waitFor(() => expect(marked(viewOption('otra'))).toBe(true));
    await act(async () => new Promise((r) => setTimeout(r, 1200)));
    expect(window.location.hash).toBe('#view=detalle');
  });
});
