import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema, edgeId } from 'canonical';
import type { Geometry, GraphGeometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera, InteractiveViewProps } from 'shell';
import { nodeOpacity, pressAt, pressNode } from './helpers';
import { NEUTRAL_THEME, metricsOf } from 'theme';

afterEach(cleanup);

const node = (id: string, title: string) => ({ id, type: 'servicio', title, description: '', children: [] });

/** a -> b, c -> d: four Nodes in a row. */
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
    edges: [
      { from: { node: 'a' }, to: { node: 'b' } },
      { from: { node: 'c' }, to: { node: 'd' } },
    ],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

/** In-memory adapter (no ELK): Nodes of 100x50 separated 200 in x. */
const inRow: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: GraphGeometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  const edges: GraphGeometry['edges'] = {};
  for (const e of view.type === 'sequence' ? [] : view.edges) {
    const from = nodes[e.from.node]!;
    const to = nodes[e.to.node]!;
    edges[edgeId(e)] = {
      points: [
        { x: from.x + 100, y: 25 },
        { x: to.x, y: 25 },
      ],
    };
  }
  return { nodes, edges, labels: {}, kind: 'grafo', pinsSolapados: [], width: 700, height: 50 };
};

const largeCamera: Camera = { x: 0, y: 0, width: 800, height: 600 };
const ids = (c: HTMLElement) => [...c.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
const viewBoxOf = (c: HTMLElement) => c.querySelector('[data-diagram]')!.getAttribute('data-camara');
const zoneOf = (c: HTMLElement) => c.firstElementChild!;

/** Mouse event with `view`, which d3-zoom uses to follow the drag (jsdom does not let it pass to the constructor). */
function gesture(target: Element | Window, kind: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
  Object.defineProperty(event, 'view', { value: window });
  fireEvent(target, event);
}

function props(extra: Partial<InteractiveViewProps> = {}): InteractiveViewProps {
  return { source, view: 'v', theme: NEUTRAL_THEME, layout: inRow, width: 800, height: 600, ...extra };
}
const mount = (extra: Partial<InteractiveViewProps> = {}) => render(<InteractiveView {...props(extra)} />);

describe('InteractiveView', () => {
  it('draws the icons of the `icons` provider', async () => {
    const withIcon = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', icon: 'logo' }] },
      model: { nodes: [node('a', 'A')], edges: [] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    const icons = { resolve: (k: string) => (k === 'logo' ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle r="3"/></svg>' : undefined), keys: () => ['logo'] };
    const { container } = mount({ source: withIcon, camera: largeCamera, icons });
    await waitFor(() => expect(container.querySelector('[data-icon="logo"]')).not.toBeNull());
  });

  it('draws the View with the geometry from the layout adapter', async () => {
    const { container } = mount({ camera: largeCamera });
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
  });

  it('without a camera, the initial one frames the whole View in the viewport, centered', async () => {
    const { container } = mount({ width: 350, height: 100 });

    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
    const [x, y, width, height] = viewBoxOf(container)!.split(' ').map(Number) as [number, number, number, number];
    expect(x).toBeLessThanOrEqual(0);
    expect(x + width).toBeGreaterThanOrEqual(700);
    expect(y).toBeLessThanOrEqual(0);
    expect(y + height).toBeGreaterThanOrEqual(50);
    expect(width / height).toBeCloseTo(3.5, 1);
  });

  it('the controlled camera sets the viewBox', async () => {
    const { container } = mount({ camera: { x: 10, y: 20, width: 400, height: 300 } });
    await waitFor(() => expect(viewBoxOf(container)).toBe('10 20 400 300'));
  });

  it('wheel zoom reports a smaller camera and does not move it if controlled', async () => {
    const onCameraChange = vi.fn();
    const { container } = mount({ camera: largeCamera, onCameraChange });
    await waitFor(() => expect(ids(container)).toContain('a'));

    fireEvent.wheel(zoneOf(container), { deltaY: -100, clientX: 0, clientY: 0 });

    const camera = onCameraChange.mock.calls.at(-1)![0] as Camera;
    expect(camera.width).toBeLessThan(800);
    expect(camera.height).toBeLessThan(600);
    expect(viewBoxOf(container)).toBe('0 0 800 600');
  });

  it('without a controlled camera, pan/zoom moves its own', async () => {
    const { container } = mount();
    await waitFor(() => expect(ids(container)).toContain('a'));
    fireEvent.wheel(zoneOf(container), { deltaY: -100, clientX: 0, clientY: 0 });
    await waitFor(() => expect(Number(viewBoxOf(container)!.split(' ')[2])).toBeLessThan(800));
  });

  it('dragging shifts the camera', async () => {
    const onCameraChange = vi.fn();
    const { container } = mount({ camera: largeCamera, onCameraChange });
    await waitFor(() => expect(ids(container)).toContain('a'));

    gesture(zoneOf(container), 'mousedown', 100, 100);
    gesture(window, 'mousemove', 60, 90);
    gesture(window, 'mouseup', 60, 90);

    const camera = onCameraChange.mock.calls.at(-1)![0] as Camera;
    expect(camera).toMatchObject({ x: 40, y: 10, width: 800, height: 600 });
  });

  it('selecting a Node fires onSelect and marks it', async () => {
    const onSelect = vi.fn();
    const { container } = mount({ camera: largeCamera, onSelect });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pressNode(container, 'b');

    expect(onSelect).toHaveBeenCalledWith('b');
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('b'));
  });

  it('selecting an Edge fires onSelect with its id and marks it', async () => {
    const onSelect = vi.fn();
    const { container } = mount({ camera: largeCamera, onSelect });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pressAt(container, 150, 25);

    const id = edgeId({ from: { node: 'a' }, to: { node: 'b' } });
    expect(onSelect).toHaveBeenCalledWith(id);
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe(id));
  });

  it('selecting an Attribute row selects it and not the Node', async () => {
    const withAttributes = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ ...node('t', 'T'), attributes: [{ name: 'id', type: 'uuid' }, { name: 'mail', type: 'text' }] }], edges: [] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    const { cabecera: header, fila: row } = metricsOf(NEUTRAL_THEME, 'architecture');
    const height: LayoutAdapter = async () => ({
      nodes: { t: { x: 0, y: 0, width: 200, height: header + 2 * row } },
      edges: {},
      labels: {},
      kind: 'grafo',
      pinsSolapados: [],
      width: 200,
      height: header + 2 * row,
    });
    const onSelect = vi.fn();
    const { container } = mount({ source: withAttributes, layout: height, camera: { x: 0, y: 0, width: 400, height: 300 }, onSelect });
    await waitFor(() => expect(ids(container)).toContain('t'));

    pressAt(container, 50, header + row * 1.5);

    expect(onSelect).toHaveBeenCalledWith('t#mail');
  });

  it('with shift pressed the Selection grows and pressing again removes', async () => {
    const { container } = mount({ camera: largeCamera });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pressNode(container, 'a');
    pressNode(container, 'b', { shiftKey: true });
    await waitFor(() => expect([...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'))).toEqual(['a', 'b']));
    pressNode(container, 'a', { shiftKey: true });
    await waitFor(() => expect([...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'))).toEqual(['b']));
  });

  it('the controlled selection rules over the internal one', async () => {
    const { container } = mount({ camera: largeCamera, selected: 'c' });
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('c'));
    pressNode(container, 'b');
    expect(container.querySelector('[data-selected]')!.getAttribute('data-selected')).toBe('c');
  });

  it('the controlled multiple Selection rules and reports all the ids', async () => {
    const onSelectionChange = vi.fn();
    const { container } = mount({ camera: largeCamera, selection: ['a', 'c'], onSelectionChange });
    const marked = (): (string | null)[] => [...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'));
    await waitFor(() => expect(marked()).toEqual(['a', 'c']));

    pressNode(container, 'b', { shiftKey: true });

    expect(onSelectionChange).toHaveBeenCalledWith(['a', 'c', 'b']);
    expect(marked()).toEqual(['a', 'c']);
  });

  it('onSelectionChange also reports when removing and when emptying the Selection', async () => {
    const onSelectionChange = vi.fn();
    const { container } = mount({ camera: largeCamera, onSelectionChange });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pressNode(container, 'a');
    pressNode(container, 'b', { shiftKey: true });
    pressNode(container, 'a', { shiftKey: true });
    pressNode(container, 'b', { shiftKey: true });

    expect(onSelectionChange.mock.calls.map((c) => c[0])).toEqual([['a'], ['a', 'b'], ['b'], []]);
  });

  it('does not draw the Nodes or Edges outside the viewport', async () => {
    const { container, rerender } = mount({ camera: { x: 0, y: 0, width: 350, height: 100 } });
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b']));
    expect(container.querySelectorAll('[data-edge]').length).toBe(1);

    rerender(<InteractiveView {...props({ camera: { x: 400, y: 0, width: 350, height: 100 } })} />);
    await waitFor(() => expect(ids(container)).toEqual(['c', 'd']));
  });

  it('a partially visible Node is drawn', async () => {
    const { container } = mount({ camera: { x: 250, y: 0, width: 100, height: 50 } });
    await waitFor(() => expect(ids(container)).toEqual(['b']));
  });

  it('passes the Step visibility to render', async () => {
    const { container } = mount({ camera: largeCamera, visibility: (id) => (id === 'a' ? 0.5 : 1) });
    await waitFor(() => expect(nodeOpacity(container, 'a')).toBe('0.5'));
  });

  it('a layout adapter failure is reported through onError', async () => {
    const onError = vi.fn();
    mount({ layout: () => Promise.reject(new Error('elk roto')), onError });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'elk roto' })));
  });

  it('a missing View is a usage failure', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => mount({ view: 'no-existe' })).toThrow(/no-existe/);
    silence.mockRestore();
  });

  it('discards the old layout when it arrives after the new one', async () => {
    let resolveOld!: (g: Geometry) => void;
    let calls = 0;
    const adapter: LayoutAdapter = (view, theme) =>
      ++calls === 1 ? new Promise<Geometry>((r) => (resolveOld = r)) : inRow(view, theme);
    const { container, rerender } = mount({ layout: adapter, camera: largeCamera });
    rerender(<InteractiveView {...props({ layout: adapter, camera: largeCamera, theme: { ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: '20px' } } })} />);
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
    resolveOld({ nodes: {}, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 1, height: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(container)).toEqual(['a', 'b', 'c', 'd']);
  });
});
