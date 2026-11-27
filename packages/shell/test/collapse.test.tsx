import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { CollapseState, Geometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera, InteractiveViewProps } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { nodeOpacity, positionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const node = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

/** c (leaf) and g (Group of three children, closed by default). */
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [node('c', 'C'), node('g', 'G', [node('g.a', 'A'), node('g.b', 'B'), node('g.c', 'C2')])],
    edges: [],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: ['g'] }],
});

/**
 * In-memory adapter: root Nodes in a row, centered at 800. An open Group
 * is wider, so opening it moves the others (the case the camera compensates).
 */
function inCenteredRow(calls: { n: number }): LayoutAdapter {
  return async (view) => {
    calls.n++;
    return centeredGeometry(view);
  };
}

function centeredGeometry(view: ResolvedView): Geometry {
  const width = (n: ResolvedView['nodes'][number]): number => (n.children.length > 0 ? n.children.length * 110 + 20 : 100);
  const nested = new Set(view.nodes.flatMap((n) => n.children.map((h) => h.id)));
  const roots = view.nodes.filter((n) => !nested.has(n.id));
  const total = roots.reduce((s, n) => s + width(n), 0) + 20 * (roots.length - 1);
  const nodes: Geometry['nodes'] = {};
  let x = 400 - total / 2;
  for (const n of roots) {
    nodes[n.id] = { x, y: 0, width: width(n), height: n.children.length > 0 ? 100 : 50 };
    n.children.forEach((h, i) => {
      nodes[h.id] = { x: 10 + i * 110, y: 40, width: 100, height: 50 };
    });
    x += width(n) + 20;
  }
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 800, height: 100 };
}

const initialCamera: Camera = { x: 0, y: 0, width: 800, height: 600 };
/** Drawn ids, sorted: flat layers paint the Groups before the Nodes. */
const ids = (c: HTMLElement) => [...c.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')).sort();
const toggle = (c: HTMLElement, id: string) => fireEvent.click(c.querySelector(`[data-toggle="${id}"]`)!);
/** Screen x of the root Node `id`: its translate minus the viewBox origin (scale 1). */
function xOnScreen(c: HTMLElement, id: string): number {
  const box = positionOf(c, id)![0];
  return box - Number(c.querySelector('[data-diagram]')!.getAttribute('data-camara')!.split(' ')[0]);
}

function mount(extra: Partial<InteractiveViewProps> = {}, calls = { n: 0 }) {
  const props: InteractiveViewProps = {
    source: source,
    view: 'v',
    theme: NEUTRAL_THEME,
    layout: inCenteredRow(calls),
    width: 800,
    height: 600,
    morphMs: 0,
    ...extra,
  };
  return { calls, ...render(<InteractiveView {...props} />) };
}

describe('collapse and expansion', () => {
  it('expanding a Group relayouts and shows its children; collapsing hides them', async () => {
    const { container } = mount();
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g', 'g.a', 'g.b', 'g.c']));

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
  });

  it('the touched Group does not change its screen position', async () => {
    const { container } = mount();
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    const before = xOnScreen(container, 'g');

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(xOnScreen(container, 'g')).toBe(before);

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).not.toContain('g.a'));
    expect(xOnScreen(container, 'g')).toBe(before);
  });

  it('with a controlled camera it reports the compensated camera', async () => {
    const onCameraChange = vi.fn();
    const { container } = mount({ camera: initialCamera, onCameraChange });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    toggle(container, 'g');
    // g goes from x=410 (total 220) to x=285 (total 470): the camera shifts -125.
    await waitFor(() => expect(onCameraChange).toHaveBeenCalledWith({ x: -125, y: 0, width: 800, height: 600 }));
  });

  it('the default state uses the cached geometry without relayout, and so does an already seen state', async () => {
    const calls = { n: 0 };
    const closed = centeredGeometry(resolveView(source, 'v')!);
    const { container } = mount({ cachedGeometry: closed }, calls);
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    expect(calls.n).toBe(0);

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(calls.n).toBe(1);

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).not.toContain('g.a'));
    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(calls.n).toBe(1);
  });

  it('the controlled state rules: it reports with onStateChange and does not expand on its own', async () => {
    const onStateChange = vi.fn<(state: CollapseState) => void>();
    const { container } = mount({ state: {}, onStateChange });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    toggle(container, 'g');
    expect(onStateChange).toHaveBeenCalledWith({ expanded: ['g'], collapsed: [] });
    await act(async () => {});
    expect(ids(container)).toEqual(['c', 'g']);
  });

  it('rejects an expansion that exceeds maxNodes', async () => {
    const onLimit = vi.fn();
    const { container, calls } = mount({ maxNodes: 3, onLimit });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    toggle(container, 'g');
    expect(onLimit).toHaveBeenCalledWith('g');
    await act(async () => {});
    expect(ids(container)).toEqual(['c', 'g']);
    expect(calls.n).toBe(1);
  });

  it('animates the morph: the Group stays fixed on screen and the new content fades in', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = mount({ morphMs: 100 });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    const before = xOnScreen(container, 'g');

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    // Own clock: with `performance.now()` a loaded machine may take longer than `morphMs` between frames and the morph would already be over.
    let now = 1000;
    // The morph requests its first frame in an effect after the layout: without waiting for it, the queue may be empty (intermittent TypeError).
    const next = async (advanceMs: number) => {
      await waitFor(() => expect(frames.length).toBeGreaterThan(0));
      await act(async () => frames.shift()!((now += advanceMs)));
    };
    await next(0); // inicio
    await next(40); // 40 of 100 ms
    const middle = nodeOpacity(container, 'g.a');
    expect(xOnScreen(container, 'g')).toBeCloseTo(before, 5);
    expect(middle).not.toBeNull();
    expect(Number(middle)).toBeLessThan(1);
  });

  it('morph with the default clock: ends when the duration elapses even if each frame re-renders (no jitter)', async () => {
    // rAF with real cancellation: only the last requested frame stays pending, as in the browser.
    const pending = new Map<number, FrameRequestCallback>();
    let nextOne = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.set(++nextOne, cb);
      return nextOne;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
    const frames = {
      shift: () => {
        const [id, cb] = [...pending][0]!;
        pending.delete(id);
        return cb;
      },
    };
    const { container } = mount({ morphMs: 100 });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    let now = 1000;
    // The morph requests its first frame in an effect after the layout: without waiting for it, the queue may be empty (intermittent TypeError).
    const next = async (advanceMs: number) => {
      await waitFor(() => expect(pending.size).toBeGreaterThan(0));
      await act(async () => frames.shift()!((now += advanceMs)));
    };
    await next(0); // inicio
    await next(50); // each frame calls setT: if the clock changes identity, the morph restarts and never reaches 100 ms
    await next(50);
    expect(nodeOpacity(container, 'g.a')).toBeNull();
    expect(container.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe('listo');
  });

  it('morph with an injected clock: does not use requestAnimationFrame and ends when the duration elapses', async () => {
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    const frames: Array<(nowMs: number) => void> = [];
    const clock = (frame: (nowMs: number) => void) => {
      frames.push(frame);
      return () => {};
    };
    const { container } = mount({ morphMs: 100, clock });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    const before = xOnScreen(container, 'g');

    toggle(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    const opacity = () => nodeOpacity(container, 'g.a');
    await act(async () => frames.shift()!(1000)); // inicio: t = 0
    await act(async () => frames.shift()!(1050)); // mitad
    expect(xOnScreen(container, 'g')).toBeCloseTo(before, 5);
    expect(Number(opacity())).toBeGreaterThan(0);
    expect(Number(opacity())).toBeLessThan(1);
    await act(async () => frames.shift()!(1100)); // fin
    expect(opacity()).toBeNull();
    expect(raf).not.toHaveBeenCalled();
  });
});
