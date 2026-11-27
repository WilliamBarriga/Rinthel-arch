import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { GraphGeometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera, InteractiveViewProps } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children });
const edge = (from: string, to: string) => ({ from: { node: from }, to: { node: to } });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [node('a'), node('b'), node('c'), node('g', [node('g.x')])],
    edges: [edge('a', 'b'), edge('b', 'c')],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], expanded: ['g'] }],
});
const inRow: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: GraphGeometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 60, y: 0, width: 50, height: 50 };
  });
  const edges: GraphGeometry['edges'] = {};
  edges['a -> b'] = { points: [{ x: 100, y: 25 }, { x: 120, y: 25 }] };
  edges['b -> c'] = { points: [{ x: 220, y: 25 }, { x: 240, y: 25 }] };
  return { nodes, edges, labels: {}, kind: 'grafo', pinsSolapados: [], width: 600, height: 50 };
};
const camera: Camera = { x: 0, y: 0, width: 800, height: 600 };

async function mount(extra: Partial<InteractiveViewProps> = {}) {
  const r = render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={camera} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return { ...r, zone: r.container.querySelector<HTMLElement>('.rd-vista')! };
}
const withFocus = (c: HTMLElement) => [...c.querySelectorAll('[data-state="focus"]')].map((e) => e.closest('[data-id]')?.getAttribute('data-id') ?? e.getAttribute('data-selected'));
const dimmed = (c: HTMLElement) => [...c.querySelectorAll('[data-atenuado]')].map((e) => e.getAttribute('data-id') ?? e.getAttribute('data-edge'));
const onPath = (c: HTMLElement) => [...c.querySelectorAll('.rd-caja [data-state="on-path"]')].map((e) => e.closest('[data-id]')!.getAttribute('data-id'));
const keyName = (zone: HTMLElement, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(zone, { key, ...init });

describe('teclado', () => {
  it('the canvas enters the tab order and on receiving focus marks the first Node', async () => {
    const { zone, container } = await mount();

    expect(zone.getAttribute('tabindex')).toBe('0');
    expect(withFocus(container)).toEqual([]);
    fireEvent.focus(zone);
    expect(withFocus(container)).toEqual(['a']);
  });

  it('Tab walks Nodes and Groups in Model order and Shift+Tab goes back', async () => {
    const { zone, container } = await mount();
    fireEvent.focus(zone);
    keyName(zone, 'Tab');
    keyName(zone, 'Tab');
    expect(withFocus(container)).toEqual(['c']);
    keyName(zone, 'Tab');
    keyName(zone, 'Tab');
    expect(withFocus(container)).toEqual(['g.x']);
    keyName(zone, 'Tab', { shiftKey: true });
    expect(withFocus(container)).toEqual(['g']);
  });

  it('arrows jump along Edges to the neighbor', async () => {
    const { zone, container } = await mount();
    fireEvent.focus(zone);
    keyName(zone, 'ArrowRight');
    expect(withFocus(container)).toEqual(['b']);
    keyName(zone, 'ArrowDown');
    expect(withFocus(container)).toEqual(['c']);
    keyName(zone, 'ArrowLeft');
    keyName(zone, 'ArrowUp');
    expect(withFocus(container)).toEqual(['a']);
  });

  it('Enter and Space collapse or open the focused Group', async () => {
    const { zone, container } = await mount();
    fireEvent.focus(zone);
    for (let i = 0; i < 3; i++) keyName(zone, 'Tab');
    expect(withFocus(container)).toEqual(['g']);
    expect(container.querySelector('[data-id="g.x"]')).not.toBeNull();
    keyName(zone, 'Enter');
    await waitFor(() => expect(container.querySelector('[data-id="g.x"]')).toBeNull());
    keyName(zone, ' ');
    await waitFor(() => expect(container.querySelector('[data-id="g.x"]')).not.toBeNull());
  });

  it('losing focus removes the ring', async () => {
    const { zone, container } = await mount();
    fireEvent.focus(zone);
    fireEvent.blur(zone);
    expect(withFocus(container)).toEqual([]);
  });
});

describe('ruta', () => {
  it('highlighting a path puts on-path what makes it up and dims the rest', async () => {
    const { container } = await mount({ route: ['a', 'b', 'c'] });

    expect(onPath(container).sort()).toEqual(['a', 'b', 'c']);
    expect(dimmed(container).sort()).toEqual(['g', 'g.x']);
    expect(container.querySelectorAll('path[data-state="on-path"]')).toHaveLength(2);
  });

  it('two selected Nodes highlight the shortest path between them', async () => {
    const { container } = await mount({ selection: ['a', 'c'] });

    expect(onPath(container).sort()).toEqual(['a', 'b', 'c']);
    expect(dimmed(container).sort()).toEqual(['g', 'g.x']);
  });

  it('without a path nor two selected Nodes nothing is dimmed', async () => {
    const { container } = await mount({ selection: ['a'] });

    expect(dimmed(container)).toEqual([]);
  });
});
