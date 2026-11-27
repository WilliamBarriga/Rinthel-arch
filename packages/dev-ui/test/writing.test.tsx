// @vitest-environment jsdom
/**
 * Writing policy on a version rejection (409), in the mounted app: every action that writes (set Theme, move, order,
 * undo, redo, jump) reloads the state and warns; applying a fix retries once. The `estado` and `historial` events are
 * held back after mounting, so the new state only arrives if the page requests it again.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BASIC_DSL, canvasReady, mountDevUi, positionOf } from './ui-helpers';
import type { MountOptions } from './ui-helpers';
import type { InMemoryDev } from '../src/contract';

afterEach(cleanup);

const DSL = `${BASIC_DSL}
theme oscuro extends neutral {
  tokens { background "#102030" }
}
`;

/** The external write adds a Node: if the View reloaded, it shows on the canvas. */
const withCache = (text: string): string => text.replace('  servicio db "Base de datos"\n', '  servicio db "Base de datos"\n  servicio cache "Cache"\n');

/** Holds back `estado` and `historial` while `retained.active`. */
function retainEvents(): { retained: { active: boolean }; wrapEvents: NonNullable<MountOptions['wrapEvents']> } {
  const retained = { active: false };
  return {
    retained: retained,
    wrapEvents: (events) => (url, onEvent) => events(url, (name, data) => {
      if (!(retained.active && (name === 'estado' || name === 'historial'))) onEvent(name, data);
    }),
  };
}

/** Mounts with the View `mapa` ready; `before` prepares the Workspace with `dev` before holding back the events. */
async function mountAndWriteOutside(before: (dev: InMemoryDev) => Promise<void> = () => Promise.resolve()) {
  const { retained, wrapEvents } = retainEvents();
  const mounted = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', wrapEvents });
  await canvasReady(mounted.container, 'mapa');
  await before(mounted.dev);
  await waitFor(() => expect(mounted.dev.workspace.text('main.dg')).toBeDefined());
  retained.active = true;
  mounted.dev.editOutside('main.dg', withCache(mounted.dev.workspace.text('main.dg')!));
  await mounted.dev.settled();
  return mounted;
}

async function waitForReloadAndNotice(container: HTMLElement): Promise<void> {
  expect((await screen.findByRole('alert')).textContent).toContain('the View was reloaded');
  await waitFor(() => expect(container.querySelector('[data-id="cache"]')).not.toBeNull());
}

const SEQUENCE_DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  interaction i {
    api -> db "lee"
  }
}

view sec {
  type sequence
  interaction i
}
`;

/** The external write adds the Lifeline `cache` to the Interaction. */
const withCacheInSequence = (text: string): string => withCache(text).replace('    api -> db "lee"\n', '    api -> db "lee"\n    db -> cache "guarda"\n');

/** Drags the header of the Lifeline `id` past the center of `to`, on screen according to the drawn camera. */
function dragHeader(container: HTMLElement, id: string, to: string): void {
  const drawing = container.querySelector<HTMLElement>('[data-diagram]')!;
  const [vx, vy, vw] = drawing.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number];
  const k = Number.parseFloat(drawing.style.width) / vw;
  const center = (labelsOf: string): [number, number] => {
    const box = container.querySelector<HTMLElement>(`[data-id="${labelsOf}"]`)!;
    const [x, y] = positionOf(container, labelsOf)!;
    return [(x + Number.parseFloat(box.style.width) / 2 - vx) * k, (y + Number.parseFloat(box.style.height) / 2 - vy) * k];
  };
  const [x, y] = center(id);
  const target = center(to)[0] + 20;
  gesture(container.querySelector(`[data-id="${id}"]`)!, 'mousedown', x, y);
  gesture(window, 'mousemove', (x + target) / 2, y);
  gesture(window, 'mousemove', target, y);
  gesture(window, 'mouseup', target, y);
}

function gesture(target: Element | Window, kind: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
  Object.defineProperty(event, 'view', { value: window });
  fireEvent(target, event);
}

describe('Writing on a 409', () => {
  it('setting a Theme reloads the View and warns', async () => {
    const { container } = await mountAndWriteOutside();
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'oscuro' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Pin oscuro to mapa' }));

    await waitForReloadAndNotice(container);
  });

  it('moving a Node reloads the View and warns', async () => {
    const { container } = await mountAndWriteOutside();
    const node = container.querySelector('[data-id="api"] [data-part="nodo"]')!;

    gesture(node, 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    gesture(window, 'mouseup', 60, 30);

    await waitForReloadAndNotice(container);
  });

  it('undo reloads the View and warns', async () => {
    const { container } = await mountAndWriteOutside(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
    });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    await waitForReloadAndNotice(container);
  });

  it('redo reloads the View and warns', async () => {
    const { container } = await mountAndWriteOutside(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
      await dev.fetch('/api/undo', { method: 'POST', body: '{}' });
    });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });

    await waitForReloadAndNotice(container);
  });

  it('ordering the Lifelines reloads the View and warns', async () => {
    const { retained, wrapEvents } = retainEvents();
    const { dev, container } = await mountDevUi({ 'main.dg': SEQUENCE_DSL }, { hash: '#view=sec', wrapEvents });
    await waitFor(() => expect(container.querySelector('.rd-vista[data-layout="listo"] [data-lifeline="db"]')).not.toBeNull(), { timeout: 15000 });
    retained.active = true;
    dev.editOutside('main.dg', withCacheInSequence(dev.workspace.text('main.dg')!));
    await dev.settled();

    dragHeader(container, 'api', 'db');

    await waitForReloadAndNotice(container);
  });

  it('jumping in the Undo history reloads the View and warns', async () => {
    const { container } = await mountAndWriteOutside(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
      fireEvent.click(await screen.findByRole('tab', { name: 'Undo history' }));
      const list = await screen.findByRole('list', { name: 'Change history' });
      await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    });

    fireEvent.click(within(screen.getByRole('list', { name: 'Change history' })).getByRole('button', { name: /Start/ }));

    await waitForReloadAndNotice(container);
  });

  // Exception to "reload and warn" (#203): applying a fix keeps its retry. It reloads, rebuilds the edit over the new
  // state and, if the retry writes, there is no notice because the action was done.
  it('applying a fix retries over the reloaded state and writes without warning', async () => {
    const { retained, wrapEvents } = retainEvents();
    const { dev, container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa', wrapEvents });
    await canvasReady(container, 'mapa');
    dev.editOutside('main.dg', DSL.replace('  api -> db "lee"\n', '  api -> dbb "lee"\n'));
    await dev.settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
    const button = await screen.findByRole('button', { name: 'Apply fix for main.dg:8' });
    retained.active = true;
    dev.editOutside('main.dg', `// agente\n${dev.workspace.text('main.dg')!}`);
    await dev.settled();

    fireEvent.click(button);

    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(`// agente\n${DSL}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
