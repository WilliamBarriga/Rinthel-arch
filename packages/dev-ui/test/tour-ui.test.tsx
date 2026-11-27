// @vitest-environment jsdom
/**
 * "Start here" tour: a fixed script of coachmarks whose stops use the open Workspace's data. The first visit shows
 * only a "1-minute tour" pill, remembered in browser-local state; "View tour" (Finder and `?` help) starts it any time.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASIC_DSL, canvasReady, mountDevUi, mountExport, positionOf, pressNode } from './ui-helpers';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Database"
  api -> db "reads"
}

view mapa {
  type architecture
  include **
  link api -> detalle
  theme oscuro
}

view detalle {
  type flow
  include api
  steps {
    step "Request" { show api }
    step "Answer" { show api }
  }
}

view otro {
  type architecture
  include db
}

theme oscuro extends neutral {
  palette { noche "#102030" }
  tokens { background "#102030" }
}
`;

const tour = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'Tour' });
const title = (dialog: HTMLElement): string => within(dialog).getByRole('heading').textContent ?? '';

/** Walks the whole tour with Next and returns each stop as `title: text`. */
async function traverse(): Promise<string[]> {
  const dialog = await tour();
  const stops: string[] = [];
  for (;;) {
    stops.push(`${title(dialog)}: ${dialog.querySelector('p')?.textContent ?? ''}`);
    const end = within(dialog).queryByRole('button', { name: 'Done' });
    if (end !== null) {
      fireEvent.click(end);
      break;
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
  }
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
  return stops;
}

async function openFromPill(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '1-minute tour' }));
}

describe('tour pill', () => {
  it('the first visit shows only the pill; using it starts the tour and it never comes back', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull();

    await openFromPill();
    expect(title(await tour())).toBe('Your repo as a diagram');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
    cleanup();

    const second = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(second.container, 'mapa');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
  });

  it('dismissing the pill hides it for good', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss the tour' }));
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull();
    cleanup();

    const second = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(second.container, 'mapa');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
  });

  it('"View tour" in the Finder starts it any time, also after dismissing the pill', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss the tour' }));

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const finder = await screen.findByRole('dialog', { name: 'Finder' });
    fireEvent.click(within(finder).getByRole('option', { name: /View tour/ }));
    expect(title(await tour())).toBe('Your repo as a diagram');
  });

  it('the ? help offers the tour too', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');

    fireEvent.keyDown(document.body, { key: '?' });
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    fireEvent.click(within(help).getByRole('button', { name: 'View tour' }));
    expect(title(await tour())).toBe('Your repo as a diagram');
  });
});

describe('tour stops', () => {
  it('use the Workspace data: active View, Views per type, a real Drill-down, Steps, the Theme, Code and Agent', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    await openFromPill();

    const stops = await traverse();
    expect(stops.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Drill-down', 'Steps', 'Themes', 'Code', 'Your agent, live']);
    expect(stops[0]).toContain('mapa (architecture)');
    expect(stops[1]).toContain('2 architecture and 1 flow');
    expect(stops[2]).toContain('API has its own View');
    expect(stops[2]).toContain('detalle');
    expect(stops[3]).toContain('detalle is told in 2 Steps, starting with "Request"');
    expect(stops[4]).toContain('oscuro');
    expect(stops[4]).toContain('Pin');
    expect(stops[5]).toContain('block of mapa');
  });

  it('the stops move the UI: Drill-down selects the linked Node, Steps leaves Step 1 on, Code opens the editor', async () => {
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    await openFromPill();
    const dialog = await tour();
    // The tour card is a portal outside the island trees; `hidden: true` keeps these queries independent of aria-hidden.
    const next = (): void => void fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));

    next();
    next();
    await waitFor(() => expect(window.location.hash).toBe('#s=api'));
    expect(screen.getByRole('tab', { name: 'Details', hidden: true }).getAttribute('aria-selected')).toBe('true');
    next();
    await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=1'));
    next();
    expect(screen.getByRole('tab', { name: 'Themes', hidden: true }).getAttribute('aria-selected')).toBe('true');
    next();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Code', hidden: true }).getAttribute('aria-selected')).toBe('true'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(title(dialog)).toBe('Themes');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
  });

  it('skip the Drill-down stop without links and fall back to generic text', async () => {
    const { container } = await mountDevUi({ 'main.dg': BASIC_DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    await openFromPill();

    const stops = await traverse();
    expect(stops.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Steps', 'Themes', 'Code', 'Your agent, live']);
    expect(stops[2]).toContain('Some Views are told in Steps');
  });
});

describe('tour in the export', () => {
  it('shows the pill and replaces Code and Agent with "In your repo"', async () => {
    const { container } = await mountExport({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    await openFromPill();

    const stops = await traverse();
    expect(stops.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Drill-down', 'Steps', 'Themes', 'In your repo']);
    expect(stops[4]).not.toContain('Pin');
    expect(stops[5]).toContain('npx rinthel-arch scan');
    expect(stops[5]).toContain('npx rinthel-arch dev --workspace .');
  });
});

describe('tour highlight', () => {
  it('follows the size of its area and the window as they change, without waiting', async () => {
    const notices: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(notice: () => void) {
          notices.push(notice);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const { container } = await mountDevUi({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await canvasReady(container, 'mapa');
    const canvas = container.querySelector<HTMLElement>('.ui-lienzo')!;
    let box = { left: 100, top: 50, width: 400, height: 300 };
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height });

    await openFromPill();
    await tour();
    const gap = (): string => {
      const s = document.querySelector<HTMLElement>('.ui-tour-hueco')?.style;
      return s === undefined ? '' : `${s.left} ${s.top} ${s.width} ${s.height}`;
    };
    await waitFor(() => expect(gap()).toBe('92px 42px 416px 316px'));

    box = { left: 10, top: 20, width: 200, height: 100 };
    act(() => notices.forEach((notice) => notice()));
    expect(gap()).toBe('2px 12px 216px 116px');

    box = { left: 0, top: 0, width: 640, height: 480 };
    act(() => {
      vi.stubGlobal('innerWidth', window.innerWidth + 200);
      window.dispatchEvent(new Event('resize'));
    });
    expect(gap()).toBe('-8px -8px 656px 496px');
  });
});

/** A real press: pointer down and up, then the click (what Base UI listens to for outside presses). */
function press(element: Element): void {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
  fireEvent.click(element);
}

describe('tour interaction', () => {
  for (const [mode, mount] of [
    ['dev', mountDevUi],
    ['export', mountExport],
  ] as const) {
    it(`in ${mode}, the highlighted UI takes clicks and the tour stays on its stop; the backdrop does nothing`, async () => {
      const { container } = await mount({ 'main.dg': DSL }, { hash: '#view=mapa' });
      await canvasReady(container, 'mapa');
      await openFromPill();
      const dialog = await tour();
      const next = (): void => void fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
      const followsIn = (stop: string): void => {
        expect(screen.getByRole('dialog', { name: 'Tour' })).toBe(dialog);
        expect(title(dialog)).toBe(stop);
      };

      // Stop 1: the canvas takes a press on a Node, which selects it.
      fireEvent.pointerDown(container.querySelector('[data-id="db"]')!);
      pressNode(container, 'db');
      await waitFor(() => expect(window.location.hash).toContain('s=db'));
      followsIn('Your repo as a diagram');

      // Stop 2: picking a View in the left island.
      next();
      press(within(screen.getByRole('listbox', { name: 'Views', hidden: true })).getByRole('option', { name: /otro/, hidden: true }));
      await waitFor(() => expect(window.location.hash).toContain('view=otro'));
      followsIn('Views');

      // Stop 3: pressing the linked Node drills into its View.
      next();
      await canvasReady(container, 'mapa');
      await waitFor(() => expect(positionOf(container, 'api')).toBeDefined());
      fireEvent.pointerDown(container.querySelector('[data-id="api"]')!);
      pressNode(container, 'api');
      await canvasReady(container, 'detalle');
      followsIn('Drill-down');

      // Stop 4: the Step controls go forward.
      next();
      await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=1'));
      press(screen.getByRole('button', { name: 'Next step', hidden: true }));
      await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=2'));
      followsIn('Steps');

      // Stop 5: a Theme from the gallery is previewed.
      next();
      press(within(screen.getByRole('listbox', { name: 'Themes', hidden: true })).getByRole('option', { name: /oscuro/, hidden: true }));
      expect(await screen.findByRole('region', { name: 'Theme oscuro', hidden: true })).toBeTruthy();
      followsIn('Themes');

      // Whatever the tour lays over the page around its card (the dimmed rest) takes presses that do nothing.
      const layers = [...document.querySelectorAll('.ui-portales *')].filter((e) => !e.contains(dialog) && !dialog.contains(e));
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) press(layer);
      followsIn('Themes');

      // The next stop still works after the UI moved; Escape closes the tour.
      next();
      expect(title(dialog)).toBe(mode === 'dev' ? 'Code' : 'In your repo');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
    });
  }
});
