import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera, ViewerIssue, InteractiveViewProps } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('a'), node('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const inRow: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: Geometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
};
const camera: Camera = { x: 0, y: 0, width: 800, height: 600 };

async function mount(extra: Partial<InteractiveViewProps> = {}) {
  const r = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={camera} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return r;
}
const over = (c: HTMLElement, x: number, y: number) => fireEvent.mouseMove(c.querySelector('[data-diagram]')!, { clientX: x, clientY: y });
const withState = (c: HTMLElement, state: string) => [...c.querySelectorAll(`[data-state="${state}"]`)];

function gesture(target: Element | Window, kind: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
  Object.defineProperty(event, 'view', { value: window });
  fireEvent(target, event);
}

describe('hover', () => {
  it('moving the mouse over a Node draws it in hover and leaving removes it', async () => {
    const { container } = await mount();
    expect(withState(container, 'hover')).toHaveLength(0);
    over(container, 50, 25);
    expect(withState(container, 'hover')).toHaveLength(1);
    expect(container.querySelector('[data-id="a"] [data-state="hover"]')).not.toBeNull();
    over(container, 500, 400);
    expect(withState(container, 'hover')).toHaveLength(0);
  });

  it('hover coexists with the selection of the same Node', async () => {
    const { container } = await mount({ selected: 'a' });
    over(container, 50, 25);
    expect(withState(container, 'selected')).toHaveLength(1);
    expect(withState(container, 'hover')).toHaveLength(1);
  });
});

describe('drag ghost', () => {
  it('the dragged Node is drawn as a ghost until dropped', async () => {
    const { container } = await mount({ onMoveNode: () => true });
    expect(withState(container, 'ghost')).toHaveLength(0);
    gesture(container.querySelector('[data-id="a"] [data-part="nodo"]')!, 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    expect(container.querySelector('[data-id="a"] [data-state="ghost"]')).not.toBeNull();
    gesture(window, 'mouseup', 60, 30);
    await waitFor(() => expect(withState(container, 'ghost')).toHaveLength(0));
  });
});

describe('issues and toasts chrome', () => {
  const issues: ViewerIssue[] = [{ severity: 'error', code: 'E1', message: 'roto', file: 'a.dg', line: 3, column: 1, href: 'vscode://a.dg:3' }] as ViewerIssue[];

  const notice = { severity: 'warning', code: 'W1', message: 'dudoso', file: 'b.dg', line: 7, column: 2, href: 'vscode://b.dg:7' } as ViewerIssue;
  const expand = (c: HTMLElement) => fireEvent.click(c.querySelector('[data-panel="issues"] button')!);

  it('starts folded with the count of errors and warnings, without a list', async () => {
    const { container } = await mount({ issues: [...issues, notice] });
    const panel = container.querySelector('[data-panel="issues"]')!;
    expect(panel.textContent).toContain('1 error');
    expect(panel.textContent).toContain('1 warning');
    expect(panel.querySelector('li')).toBeNull();
    expect(panel.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('unfolded it draws all issues as links with classes and no inline styles; it folds again', async () => {
    const { container } = await mount({ issues: [...issues, notice] });
    expand(container);
    const panel = container.querySelector('[data-panel="issues"]')!;
    expect(panel.getAttribute('style')).toBeNull();
    expect(panel.className).toContain('rd-');
    expect(panel.querySelectorAll('li')).toHaveLength(2);
    const link = panel.querySelector('a')!;
    expect(link.textContent).toBe('a.dg:3');
    expect(link.getAttribute('href')).toBe('vscode://a.dg:3');
    expect(panel.textContent).toContain('E1 roto');
    expect(panel.textContent).toContain('W1 dudoso');
    expand(container);
    expect(panel.querySelector('li')).toBeNull();
  });

  it('without issues there is no panel', async () => {
    const { container } = await mount();
    expect(container.querySelector('[data-panel="issues"]')).toBeNull();
  });

  it('draws the toasts as alerts with classes', async () => {
    const { container } = await mount({ toasts: ['Pin rechazado'] });
    const toast = container.querySelector('[role="alert"]')!;
    expect(toast.textContent).toBe('Pin rechazado');
    expect(toast.getAttribute('style')).toBeNull();
    expect(toast.className).toContain('rd-');
  });
});
