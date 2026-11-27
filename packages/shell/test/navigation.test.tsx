import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, InteractiveViewProps } from 'shell';
import { pressNode } from './helpers';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

// View 'a' links Node x to 'b'; 'b' links y to 'a' (cycle) and z to 'c'.
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('x'), node('y'), node('z')], edges: [] },
  views: [
    { id: 'a', type: 'architecture', include: ['x'], exclude: [], links: [{ node: 'x', view: 'b' }] },
    {
      id: 'b',
      type: 'architecture',
      include: ['y', 'z'],
      exclude: [],
      links: [
        { node: 'y', view: 'a' },
        { node: 'z', view: 'c' },
      ],
    },
    { id: 'c', type: 'architecture', include: ['z'], exclude: [] },
  ],
});

const inRow: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: Geometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 500, height: 50 };
};

const mount = (extra: Partial<InteractiveViewProps> = {}) =>
  render(
    <InteractiveView source={source} theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={{ x: 0, y: 0, width: 800, height: 600 }} {...extra} />,
  );

const drawnOne = (c: HTMLElement, id: string) => waitFor(() => expect(c.querySelector(`[data-id="${id}"]`)).not.toBeNull());
const press = (c: HTMLElement, id: string) => pressNode(c, id);
const breadcrumbs = () => Array.from(document.querySelectorAll('[data-breadcrumbs] [data-crumb]')).map((e) => e.getAttribute('data-crumb'));

describe('link, breadcrumbs and back', () => {
  it('a link changes the View and adds a breadcrumb', async () => {
    const { container } = mount({ defaultView: 'a' });
    await drawnOne(container, 'x');
    expect(breadcrumbs()).toEqual(['a']);
    press(container, 'x');
    await drawnOne(container, 'y');
    expect(container.querySelector('[data-id="x"]')).toBeNull();
    expect(breadcrumbs()).toEqual(['a', 'b']);
  });

  it('back and a breadcrumb click restore the View', async () => {
    const { container } = mount({ defaultView: 'a' });
    await drawnOne(container, 'x');
    press(container, 'x');
    await drawnOne(container, 'y');
    press(container, 'z');
    await waitFor(() => expect(container.querySelector('[data-id="y"]')).toBeNull());
    await drawnOne(container, 'z');
    expect(breadcrumbs()).toEqual(['a', 'b', 'c']);
    expect(screen.getByRole('navigation', { name: 'Breadcrumbs' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await drawnOne(container, 'y');
    expect(breadcrumbs()).toEqual(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    await drawnOne(container, 'x');
    expect(breadcrumbs()).toEqual(['a']);
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a cycle between Views does not break navigation', async () => {
    const { container } = mount({ defaultView: 'a' });
    await drawnOne(container, 'x');
    press(container, 'x');
    await drawnOne(container, 'y');
    press(container, 'y');
    await drawnOne(container, 'x');
    expect(breadcrumbs()).toEqual(['a', 'b', 'a']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await drawnOne(container, 'y');
    expect(breadcrumbs()).toEqual(['a', 'b']);
  });

  it('controlled: reports with onViewChange and onPathChange and does not change on its own', async () => {
    const onViewChange = vi.fn();
    const onPathChange = vi.fn();
    const { container } = mount({ view: 'a', path: ['a'], onViewChange, onPathChange });
    await drawnOne(container, 'x');
    press(container, 'x');
    expect(onViewChange).toHaveBeenCalledWith('b');
    expect(onPathChange).toHaveBeenCalledWith(['a', 'b']);
    expect(container.querySelector('[data-id="x"]')).not.toBeNull();
    expect(breadcrumbs()).toEqual(['a']);
  });

  it('controlled: the path and View that come through props are shown', async () => {
    const onPathChange = vi.fn();
    const { container } = mount({ view: 'c', path: ['a', 'b', 'c'], onPathChange });
    await drawnOne(container, 'z');
    expect(breadcrumbs()).toEqual(['a', 'b', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(onPathChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('only view (without path): the path is completed with the active View', async () => {
    const { container } = mount({ view: 'b' });
    await drawnOne(container, 'y');
    expect(breadcrumbs()).toEqual(['b']);
  });
});

describe('Geometry cached per View when navigating', () => {
  it('uses the Geometry that arrived for the active View and computes in the adapter (the Worker) the one that did not', async () => {
    const layout = vi.fn(inRow);
    const cached: Geometry = { kind: 'grafo', nodes: { x: { x: 0, y: 0, width: 100, height: 50 } }, edges: {}, labels: {}, pinsSolapados: [], width: 100, height: 50 };
    const { container } = mount({ defaultView: 'a', layout, cachedGeometries: { a: cached } });
    await drawnOne(container, 'x');
    expect(layout).not.toHaveBeenCalled();

    press(container, 'x');
    await drawnOne(container, 'y');
    expect(layout).toHaveBeenCalledTimes(1);
    expect(layout.mock.calls[0]?.[0].nodes.map((n) => n.id)).toEqual(['y', 'z']);
  });
});
