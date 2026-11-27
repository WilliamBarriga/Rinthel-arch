// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openTab, BASIC_DSL, mountDevUi } from './ui-helpers';
import type { MountOptions } from './ui-helpers';
import type { InMemoryDev } from '../src/contract';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const DSL = BASIC_DSL;

const movePin = async (dev: InMemoryDev, node: string, x: number): Promise<void> => {
  const res = await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node, x, y: 0 }) });
  expect(res.status).toBe(200);
};

async function openHistory(): Promise<HTMLElement> {
  await openTab('Undo history');
  return screen.findByRole('list', { name: 'Change history' });
}

const rows = (list: HTMLElement): HTMLElement[] => within(list).getAllByRole('listitem');
const button = (list: HTMLElement, name: RegExp): HTMLButtonElement => within(list).getByRole('button', { name });

describe('History island', () => {
  it('lists the most recent on top with description, files and relative time, marks the current position and ends in Start', async () => {
    const { dev } = await mountDevUi({ 'main.dg': DSL });
    await movePin(dev, 'api', 10);
    await movePin(dev, 'db', 20);
    const list = await openHistory();

    await waitFor(() => expect(rows(list)).toHaveLength(3));
    expect(rows(list).map((f) => f.textContent)).toEqual([expect.stringMatching(/move db in mapa.*main\.dg.*(now|ago)/), expect.stringMatching(/move api in mapa/), expect.stringMatching(/Start/)]);
    expect(button(list, /move db in mapa/).getAttribute('aria-current')).toBe('step');
    expect(button(list, /move api in mapa/).getAttribute('aria-current')).toBeNull();
  });

  it('a click jumps to the entry without pushing: the future stays dimmed and one can go back to it', async () => {
    const { dev } = await mountDevUi({ 'main.dg': DSL });
    await movePin(dev, 'api', 10);
    const withOne = dev.workspace.text('main.dg');
    await movePin(dev, 'db', 20);
    const withTwo = dev.workspace.text('main.dg');
    const list = await openHistory();

    fireEvent.click(await within(list).findByRole('button', { name: /move api in mapa/ }));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(withOne));
    await waitFor(() => expect(button(list, /move api in mapa/).getAttribute('aria-current')).toBe('step'));
    expect(rows(list)).toHaveLength(3);
    expect(rows(list)[0]?.getAttribute('data-futuro')).toBe('true');

    fireEvent.click(button(list, /Start/));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL));
    fireEvent.click(button(list, /move db in mapa/));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(withTwo));
  });

  it('after an external write, the entries that would restore the file are disabled with the reason', async () => {
    const { dev } = await mountDevUi({ 'main.dg': DSL });
    await movePin(dev, 'api', 10);
    const list = await openHistory();
    await waitFor(() => expect(rows(list)).toHaveLength(2));

    dev.editOutside('main.dg', `${dev.workspace.text('main.dg')}\n// fuera\n`);
    await waitFor(() => expect(button(list, /Start/).disabled).toBe(true));
    expect(rows(list)[1]?.textContent).toMatch(/main\.dg.*changed outside dev/);
    expect(button(list, /move api in mapa/).disabled).toBe(false);
  });

  it('before jumping, the pending editor save is flushed', async () => {
    const posts: string[] = [];
    const wrapFetch: MountOptions['wrapFetch'] = (f) =>
      (async (entry: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'POST') posts.push(String(entry));
        return f(entry, init);
      }) as typeof fetch;
    const { dev } = await mountDevUi({ 'main.dg': DSL }, { wrapFetch });
    await movePin(dev, 'api', 10);
    const list = await openHistory();
    fireEvent.click(await screen.findByRole('tab', { name: 'Code' }));
    const box = await screen.findByRole('textbox', { name: /^Code of main\.dg/ });
    const view = EditorView.findFromDOM(box)!;
    await waitFor(() => expect(view.state.doc.toString()).toBe(dev.workspace.text('main.dg')));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    view.dispatch({ changes: { from: view.state.doc.length, insert: '// pendiente\n' }, userEvent: 'input.type' });
    fireEvent.click(button(list, /Start/));
    vi.useRealTimers();

    await waitFor(() => expect(posts).toEqual(['/api/edit', '/api/history/jump']));
    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(DSL));
    await waitFor(() => expect(button(list, /text of main\.dg/)).toBeDefined());
  });
});
