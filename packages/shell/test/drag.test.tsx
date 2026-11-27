import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera, InteractiveViewProps } from 'shell';
import { doubleClickNode, positionOf, pressNode } from './helpers';
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

function gesture(target: Element | Window, kind: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: kind === 'mouseup' ? 0 : 1 });
  Object.defineProperty(event, 'view', { value: window });
  fireEvent(target, event);
}

async function mount(extra: Partial<InteractiveViewProps> = {}) {
  const r = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={camera} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return r;
}
const nodeA = (c: HTMLElement) => c.querySelector('[data-id="a"] [data-part="nodo"]')!;
const positionA = (c: HTMLElement) => { const p = positionOf(c, 'a'); return p === undefined ? undefined : `translate(${p[0]} ${p[1]})`; };

describe('Node drag (onMoveNode)', () => {
  it('dropping a Node reports the new center (Pin coordinates) and does not move the camera', async () => {
    const onMoveNode = vi.fn();
    const onCameraChange = vi.fn();
    const { container } = await mount({ onMoveNode, onCameraChange });

    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    gesture(window, 'mouseup', 60, 30);

    expect(onMoveNode).toHaveBeenCalledWith({ id: 'a', x: 100, y: 45 });
    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('shows the Node at the new position while dragging', async () => {
    const { container } = await mount({ onMoveNode: vi.fn() });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    expect(positionA(container)).toBe('translate(50 20)');
    gesture(window, 'mouseup', 60, 30);
  });

  it('the offset is measured in geometry units, not in px', async () => {
    const onMoveNode = vi.fn();
    const { container } = await mount({ onMoveNode, camera: { x: 0, y: 0, width: 400, height: 300 } });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 110, 10);
    gesture(window, 'mouseup', 110, 10);
    expect(onMoveNode).toHaveBeenCalledWith({ id: 'a', x: 100, y: 25 });
  });

  it('a click without movement still selects and does not report', async () => {
    const onMoveNode = vi.fn();
    const onSelect = vi.fn();
    const { container } = await mount({ onMoveNode, onSelect });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mouseup', 10, 10);
    pressNode(container, 'a');
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('the double click on a Node reports onOpen with its kind and id', async () => {
    const onOpen = vi.fn();
    const { container } = await mount({ onOpen });
    doubleClickNode(container, 'a');
    expect(onOpen).toHaveBeenCalledWith({ kind: 'nodo', id: 'a' });
  });

  it('dragging does not select', async () => {
    const onSelect = vi.fn();
    const { container } = await mount({ onMoveNode: vi.fn(), onSelect });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    gesture(window, 'mouseup', 60, 30);
    pressNode(container, 'a');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dragging the background still moves the camera', async () => {
    const onCameraChange = vi.fn();
    const onMoveNode = vi.fn();
    const { container } = await mount({ onMoveNode, onCameraChange });
    gesture(container.firstElementChild!, 'mousedown', 100, 100);
    gesture(window, 'mousemove', 60, 90);
    gesture(window, 'mouseup', 60, 90);
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onCameraChange.mock.calls.at(-1)![0]).toMatchObject({ x: 40, y: 10 });
  });

  it('without onMoveNode (static export) dragging a Node moves the camera', async () => {
    const onCameraChange = vi.fn();
    const { container } = await mount({ onCameraChange });
    gesture(nodeA(container), 'mousedown', 100, 100);
    gesture(window, 'mousemove', 60, 90);
    gesture(window, 'mouseup', 60, 90);
    expect(onCameraChange.mock.calls.at(-1)![0]).toMatchObject({ x: 40, y: 10 });
    expect(positionA(container)).toBe('translate(0 0)');
  });

  it('if the callback resolves false the Node goes back to its place', async () => {
    const { container } = await mount({ onMoveNode: () => Promise.resolve(false) });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    await act(async () => gesture(window, 'mouseup', 60, 30));
    await waitFor(() => expect(positionA(container)).toBe('translate(0 0)'));
  });

  it('if the callback resolves true the Node stays where it was dropped', async () => {
    const { container } = await mount({ onMoveNode: () => Promise.resolve(true) });
    gesture(nodeA(container), 'mousedown', 10, 10);
    gesture(window, 'mousemove', 60, 30);
    await act(async () => gesture(window, 'mouseup', 60, 30));
    expect(positionA(container)).toBe('translate(50 20)');
  });
});
