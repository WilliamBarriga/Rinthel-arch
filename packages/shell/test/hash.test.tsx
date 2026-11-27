import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView, deserializeState, browserHash, serializeState, useHashState } from 'shell';
import type { HashAdapter, LayoutAdapter, ShellState } from 'shell';
import { pressNode } from './helpers';
import { NEUTRAL_THEME } from 'theme';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '#');
});

const node = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('g', [node('g.h'), node('g.i')]), node('x'), node('y')], edges: [] },
  views: [
    {
      id: 'a',
      type: 'architecture',
      include: ['g', 'x'],
      exclude: [],
      links: [{ node: 'x', view: 'b' }],
      steps: [
        { title: 'uno', show: [{ selector: 'g' }] },
        { title: 'dos', show: [{ selector: 'x' }] },
      ],
    },
    { id: 'b', type: 'architecture', include: ['y'], exclude: [], links: [{ node: 'y', view: 'a' }] },
  ],
});

const DEFAULTS: ShellState = { path: ['a'], state: {}, selected: null, step: 0 };

const full: ShellState = {
  path: ['a', 'b', 'a'],
  state: { expanded: ['g'], collapsed: [] },
  selected: 'x',
  step: 2,
  camera: { x: 10.5, y: -3, width: 400, height: 300 },
};

describe('serializeState and deserializeState', () => {
  it('round trip without loss', () => {
    expect(deserializeState(serializeState(full), source)).toEqual(full);
  });

  it('ids with special characters survive', () => {
    const f = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('a_b-1')], edges: [] },
      views: [{ id: 'v 1,2&=%', type: 'flow', include: ['**'], exclude: [] }],
    });
    const e: ShellState = { path: ['v 1,2&=%'], state: {}, selected: 'a_b-1', step: 0 };
    expect(deserializeState(serializeState(e), f)).toEqual(e);
  });

  it('the default state serializes to an empty hash', () => {
    expect(serializeState(DEFAULTS, 'a')).toBe('');
    expect(deserializeState('', source)).toEqual(DEFAULTS);
  });

  it('accepts the # prefix', () => {
    expect(deserializeState('#' + serializeState(full), source)).toEqual(full);
  });

  it('a garbage hash falls back to the default state', () => {
    for (const h of ['%%%', '===&&&', 'p=&s=&t=abc&cam=x,y', 'zzz']) {
      expect(deserializeState(h, source)).toEqual(DEFAULTS);
    }
  });

  it('missing ids fall back to the default per field', () => {
    const e = deserializeState('p=a&p=nada&p=b&s=fantasma&e=g&e=nope&c=zzz&t=9', source);
    expect(e.path).toEqual(['a', 'b']);
    expect(e.selected).toBeNull();
    expect(e.state).toEqual({ expanded: ['g'], collapsed: [] });
    expect(e.step).toBe(0);
  });

  it('a missing View falls back to the default View', () => {
    expect(deserializeState('p=nada', source).path).toEqual(['a']);
  });

  it('a sequence View with Steps enters at the first one; architecture keeps 0', () => {
    const sequence = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('x'), node('y')], edges: [], interactions: [{ id: 'i', title: 'i', items: [{ type: 'message', kind: 'sync', from: 'x', to: 'y' }] }] },
      views: [{ id: 's', type: 'sequence', include: ['**'], exclude: [], interaction: 'i', steps: [{ title: 'uno', show: [] }] }],
    });
    expect(deserializeState('', sequence).step).toBe(1);
    expect(deserializeState('p=s&t=0', sequence).step).toBe(0);
    expect(serializeState({ path: ['s'], state: {}, selected: null, step: 1 }, 's', sequence)).toBe('');
    expect(serializeState({ path: ['s'], state: {}, selected: null, step: 0 }, 's', sequence)).toBe('t=0');
    expect(deserializeState('', source).step).toBe(0);
  });

  it('an ER View with Steps enters at the first one: Step 0 would leave it empty', () => {
    const er = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('x'), node('y')], edges: [] },
      views: [{ id: 'e', type: 'er', include: ['**'], exclude: [], steps: [{ title: 'uno', show: [{ selector: 'x' }] }] }],
    });
    expect(deserializeState('', er).step).toBe(1);
    expect(deserializeState('p=e&t=0', er).step).toBe(0);
    expect(serializeState({ path: ['e'], state: {}, selected: null, step: 1 }, 'e', er)).toBe('');
  });

  it('the Step is clamped to the Steps of the active View', () => {
    expect(deserializeState('p=b&t=1', source).step).toBe(0);
    expect(deserializeState('p=a&t=-1', source).step).toBe(0);
    expect(deserializeState('p=a&t=1', source).step).toBe(1);
  });

  it('an invalid camera is discarded', () => {
    expect(deserializeState('cam=1,2,0,5', source).camera).toBeUndefined();
    expect(deserializeState('cam=1,2,3', source).camera).toBeUndefined();
    expect(deserializeState('cam=1,2,NaN,5', source).camera).toBeUndefined();
  });
});

describe('useHashState', () => {
  const fakeAdapter = (initial = '') => {
    let hash = initial;
    const listeners = new Set<() => void>();
    const writes: { hash: string; replace: boolean }[] = [];
    const a: HashAdapter = {
      read: () => hash,
      write: (h, o) => {
        hash = h;
        writes.push({ hash: h, replace: o.replace });
      },
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    return {
      a,
      writes,
      navigate: (h: string) => {
        hash = h;
        listeners.forEach((o) => o());
      },
    };
  };

  it('starts from the hash and exposes it as props', () => {
    const { a } = fakeAdapter(serializeState(full));
    const { result } = renderHook(() => useHashState({ source, hash: a, camera: true }));
    expect(result.current.view).toBe('a');
    expect(result.current.path).toEqual(full.path);
    expect(result.current.state).toEqual(full.state);
    expect(result.current.selected).toBe('x');
    expect(result.current.step).toBe(2);
    expect(result.current.camera).toEqual(full.camera);
  });

  it('the callbacks write the hash; a View change pushes history and resets the rest', () => {
    const { a, writes } = fakeAdapter();
    const { result } = renderHook(() => useHashState({ source, hash: a, camera: true }));
    act(() => result.current.onSelect('x'));
    act(() => result.current.onStepChange(1));
    act(() => result.current.onStateChange({ expanded: ['g'] }));
    act(() => result.current.onCameraChange({ x: 1, y: 2, width: 3, height: 4 }));
    expect(writes.every((e) => e.replace)).toBe(true);
    const before = deserializeState(writes[writes.length - 1]!.hash, source);
    expect(before).toMatchObject({ selected: 'x', step: 1, state: { expanded: ['g'] }, camera: { x: 1, y: 2, width: 3, height: 4 } });

    act(() => result.current.onPathChange(['a', 'b']));
    const last = writes[writes.length - 1]!;
    expect(last.replace).toBe(false);
    expect(deserializeState(last.hash, source)).toEqual({ path: ['a', 'b'], state: {}, selected: null, step: 0 });
    expect(result.current.selected).toBeNull();
    expect(result.current.camera).toBeUndefined();
  });

  it('without camera:true the viewport is neither read nor written', () => {
    const { a, writes } = fakeAdapter('cam=1,2,3,4');
    const { result } = renderHook(() => useHashState({ source, hash: a }));
    expect(result.current.camera).toBeUndefined();
    act(() => result.current.onCameraChange({ x: 9, y: 9, width: 9, height: 9 }));
    expect(writes).toEqual([]);
  });

  it('an external hash change (browser back) updates the state', () => {
    const { a, navigate } = fakeAdapter();
    const { result } = renderHook(() => useHashState({ source, hash: a }));
    act(() => navigate('p=a&p=b'));
    expect(result.current.view).toBe('b');
  });

  it('a path change that keeps the View keeps the rest', () => {
    const { a } = fakeAdapter('s=x');
    const { result } = renderHook(() => useHashState({ source, hash: a }));
    act(() => result.current.onPathChange(['a', 'a']));
    expect(result.current.selected).toBe('x');
  });

  it('configurable default View', () => {
    const { a } = fakeAdapter();
    const { result } = renderHook(() => useHashState({ source, hash: a, defaultView: 'b' }));
    expect(result.current.view).toBe('b');
  });
});

describe('integration with InteractiveView and location.hash', () => {
  const layout: LayoutAdapter = async (view: ResolvedView) => {
    const nodes: Geometry['nodes'] = {};
    view.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 500, height: 50 };
  };
  function App() {
    const props = useHashState({ source, hash: browserHash(window), camera: true });
    return <InteractiveView source={source} theme={NEUTRAL_THEME} layout={layout} width={800} height={600} {...props} />;
  }
  const drawnOne = (c: HTMLElement, id: string) => waitFor(() => expect(c.querySelector(`[data-id="${id}"]`)).not.toBeNull());

  it('reloading with the hash restores View and path', async () => {
    const first = render(<App />);
    await drawnOne(first.container, 'x');
    pressNode(first.container, 'x');
    await drawnOne(first.container, 'y');
    expect(window.location.hash).toContain('p=a&p=b');
    first.unmount();

    const second = render(<App />);
    await drawnOne(second.container, 'y');
    expect(Array.from(document.querySelectorAll('[data-breadcrumbs] [data-crumb]')).map((e) => e.getAttribute('data-crumb'))).toEqual(['a', 'b']);
  });

  it('restores Step and selection in the initial View', async () => {
    window.history.replaceState(null, '', '#s=g&t=1');
    const { container } = render(<App />);
    await drawnOne(container, 'x');
    expect(container.querySelector('[data-selected="g"]')).not.toBeNull();
    expect(container.textContent).toContain('Step 1 of 2');
  });

  it('an invalid hash does not break', async () => {
    window.history.replaceState(null, '', '#p=nada&s=zzz&t=99');
    const { container } = render(<App />);
    await drawnOne(container, 'x');
  });
});

describe('browserHash on local files', () => {
  it('if replaceState throws (file:// in some browsers), it replaces the entry with location.replace', () => {
    const replacements: string[] = [];
    const win = {
      location: { hash: '', pathname: '/a.html', search: '', replace: (target: string) => replacements.push(target) },
      history: {
        replaceState: () => {
          throw new DOMException('no permitido', 'SecurityError');
        },
        pushState: () => undefined,
      },
    } as unknown as Window;

    browserHash(win).write('s=x', { replace: true });

    expect(replacements).toEqual(['#s=x']);
  });

  it('if pushState throws when emptying the hash, it empties it with location.hash', () => {
    const hashes: string[] = [];
    const win = {
      location: {
        pathname: '/a.html',
        search: '',
        set hash(value: string) {
          hashes.push(value);
        },
      },
      history: {
        pushState: () => {
          throw new DOMException('no permitido', 'SecurityError');
        },
      },
    } as unknown as Window;

    browserHash(win).write('', { replace: false });

    expect(hashes).toEqual(['']);
  });
});
