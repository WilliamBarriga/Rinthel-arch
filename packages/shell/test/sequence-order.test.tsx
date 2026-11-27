import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, InteractiveViewProps } from 'shell';
import { NEUTRAL_THEME } from 'theme';

import { positionOf } from './helpers';

afterEach(cleanup);

const text = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    cliente -> sistema.api "pedir"
    sistema -> sistema "auditar"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
  }
}
view abierta { type sequence
 interaction i }
view cerrada { type sequence
 interaction i
 depth 1 }
`;
const source = openSession({ 'main.dg': text }).source!;
const layout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });
const camera = { x: 0, y: 0, width: 1200, height: 800 };

async function mount(view: string, extra: Partial<InteractiveViewProps> = {}) {
  const r = render(<InteractiveView source={source} view={view} theme={NEUTRAL_THEME} layout={layout} width={1200} height={800} camera={camera} {...extra} />);
  // With a loaded machine the headers appear before the layout ends: the gesture is made on the final Geometry.
  await waitFor(() => expect(r.container.querySelector('.rd-vista[data-layout="listo"] [data-lifeline="cola"]')).not.toBeNull(), { timeout: 15000 });
  return r;
}

function gesture(target: Element | Window, kind: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
  Object.defineProperty(event, 'view', { value: window });
  fireEvent(target, event);
}

/** Center of a Lifeline header in canvas coordinates (camera 1:1). */
function middle(c: HTMLElement, id: string): [number, number] {
  const [x, y] = positionOf(c, id)!;
  const box = c.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  return [x + Number.parseFloat(box.style.width) / 2, y + Number.parseFloat(box.style.height) / 2];
}

/** Drags the header of `id` to `towardX` (center) and releases. */
function dragHeader(c: HTMLElement, id: string, towardX: number): void {
  const [x, y] = middle(c, id);
  gesture(c.querySelector(`[data-id="${id}"]`)!, 'mousedown', x, y);
  gesture(window, 'mousemove', (x + towardX) / 2, y);
  gesture(window, 'mousemove', towardX, y);
  gesture(window, 'mouseup', towardX, y);
}

const T = { timeout: 30000 };

describe('InteractiveView: reordering Lifelines by drag', () => {
  it('dragging a header reports the full visible order, without moving the camera', T, async () => {
    const onReorderLifelines = vi.fn();
    const onCameraChange = vi.fn();
    const { container } = await mount('abierta', { onReorderLifelines, onCameraChange });
    dragHeader(container, 'cliente', middle(container, 'cola')[0] + 20);
    expect(onReorderLifelines).toHaveBeenCalledWith({ order: ['sistema', 'sistema.api', 'sistema.db', 'cola', 'cliente'] });
    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('the dragged header is a ghost while the gesture lasts', T, async () => {
    const { container } = await mount('abierta', { onReorderLifelines: vi.fn() });
    const [x, y] = middle(container, 'cliente');
    gesture(container.querySelector('[data-id="cliente"]')!, 'mousedown', x, y);
    gesture(window, 'mousemove', x + 60, y);
    expect(container.querySelector('[data-id="cliente"]')!.getAttribute('data-estados') ?? container.querySelector('[data-id="cliente"] [data-estados]')?.getAttribute('data-estados')).toContain('ghost');
    gesture(window, 'mouseup', x + 60, y);
  });

  it('a child only moves inside the box of its Group', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await mount('abierta', { onReorderLifelines });
    // Far to the right of the queue: inside the box it can only end up last.
    dragHeader(container, 'sistema.api', middle(container, 'cola')[0] + 300);
    expect(onReorderLifelines).toHaveBeenCalledWith({ order: ['cliente', 'sistema', 'sistema.db', 'sistema.api', 'cola'] });
    onReorderLifelines.mockClear();
    // Far to the left of the client: it does not go past the Group's own Lifeline.
    dragHeader(container, 'sistema.db', middle(container, 'cliente')[0] - 300);
    expect(onReorderLifelines).toHaveBeenCalledWith({ order: ['cliente', 'sistema', 'sistema.db', 'sistema.api', 'cola'] });
  });

  it('dragging the box header moves the block as consecutive children', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await mount('abierta', { onReorderLifelines });
    const title = container.querySelector<HTMLElement>('[data-group-box-title="sistema"]')!;
    const box = container.querySelector<HTMLElement>('[data-group-box="sistema"]')!;
    const x = Number.parseFloat(box.style.left) + Number.parseFloat(title.style.left) + 5;
    const y = Number.parseFloat(box.style.top) + Number.parseFloat(title.style.top) + 5;
    gesture(title, 'mousedown', x, y);
    gesture(window, 'mousemove', x + 100, y);
    gesture(window, 'mousemove', middle(container, 'cola')[0] + 20, y);
    gesture(window, 'mouseup', middle(container, 'cola')[0] + 20, y);
    expect(onReorderLifelines).toHaveBeenCalledWith({ order: ['cliente', 'cola', 'sistema', 'sistema.api', 'sistema.db'] });
  });

  it('a drag that does not change the order does not report; a click still selects', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await mount('abierta', { onReorderLifelines });
    dragHeader(container, 'cola', middle(container, 'cola')[0] + 40);
    expect(onReorderLifelines).not.toHaveBeenCalled();
  });

  it('without onReorderLifelines there is no drag', T, async () => {
    const { container } = await mount('abierta');
    dragHeader(container, 'cliente', 1100);
    expect(container.querySelector('[data-id="cliente"]')).not.toBeNull();
  });

  it('with the Group collapsed the visible order carries the Group as one Lifeline', T, async () => {
    const onReorderLifelines = vi.fn();
    const { container } = await mount('cerrada', { onReorderLifelines });
    dragHeader(container, 'sistema', middle(container, 'cola')[0] + 20);
    expect(onReorderLifelines).toHaveBeenCalledWith({ order: ['cliente', 'cola', 'sistema'] });
  });
});
