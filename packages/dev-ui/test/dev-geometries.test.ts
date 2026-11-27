import { describe, expect, it } from 'vitest';

import type { CachedGeometry } from 'canonical';

import type { DevState } from '../src/protocol';
import type { GeometryRead } from '../browser/client';
import { createDevGeometries } from '../browser/canvas/geometries';

const geometry = (view: string): CachedGeometry => ({ view, theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: {}, edges: {}, labels: {}, pinsSolapados: [], width: 1, height: 1 } });

/** The Source is opaque to the cache: only its existence matters. */
const state = (version: number, change?: DevState['cambio']): DevState => ({
  version,
  ...(change !== undefined && { cambio: change }),
  fuente: { views: [{ id: 'a' }, { id: 'b' }] } as unknown as DevState['fuente'],
  iconos: {},
  vistas: ['a', 'b'],
  issues: [],
});

/** Fake Geometry server: each request stays pending until the test answers it. */
function server() {
  const requested: Array<{ view: string; respond: (l: GeometryRead) => Promise<void> }> = [];
  const request = (view: string) =>
    new Promise<GeometryRead>((ok) => {
      requested.push({
        view: view,
        respond: async (l) => {
          ok(l);
          await new Promise((ready) => setTimeout(ready, 0));
        },
      });
    });
  return { request, vistas: () => requested.map(({ view }) => view), last: () => requested[requested.length - 1]! };
}

function assemble(active = 'a') {
  const s = server();
  const cache = createDevGeometries({ request: s.request, initialView: () => active });
  return { s, cache };
}

describe('on-demand Geometry of the dev page', () => {
  it('on start it requests only the Geometry of the active View and draws when it arrives', async () => {
    const { s, cache } = assemble('b');

    cache.receive(state(0));
    expect(s.vistas()).toEqual(['b']);
    expect(cache.drawable()).toBeUndefined();

    await s.last().respond({ ok: true, geometry: geometry('b') });
    expect(cache.drawable()?.state.version).toBe(0);
    expect(Object.keys(cache.drawable()?.geometries ?? {})).toEqual(['b']);
  });

  it('after a structure change it requests only the active View and keeps the previous drawing until it arrives', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });

    cache.receive(state(1, 'estructura'));
    expect(s.vistas()).toEqual(['a', 'a']);
    expect(cache.drawable()?.state.version).toBe(0);

    const fresh = geometry('a');
    await s.last().respond({ ok: true, geometry: fresh });
    expect(cache.drawable()?.state.version).toBe(1);
    expect(cache.drawable()?.geometries['a']).toBe(fresh);
  });

  it('after a paint (or code) change it requests no Geometry and draws right away with the current one', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    const current = geometry('a');
    await s.last().respond({ ok: true, geometry: current });

    cache.receive(state(1, 'pintura'));
    cache.receive(state(2, 'codigo'));

    expect(s.vistas()).toEqual(['a']);
    expect(cache.drawable()?.state.version).toBe(2);
    expect(cache.drawable()?.geometries['a']).toBe(current);
  });

  it('if a version was skipped it does not know what changed: it requests the active View again', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });

    cache.receive(state(3, 'pintura'));

    expect(s.vistas()).toEqual(['a', 'a']);
  });

  it('navigating to another View requests its Geometry only once; without an answer there is no Geometry (the Worker computes it)', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });

    cache.activate('b');
    cache.activate('b');
    expect(s.vistas()).toEqual(['a', 'b']);

    await s.last().respond({ ok: false });
    expect(cache.drawable()?.geometries['b']).toBeUndefined();
    expect(cache.drawable()?.errors).toEqual([]);

    cache.activate('a');
    expect(s.vistas()).toEqual(['a', 'b']);
  });

  it('if the Geometry of the active View does not arrive after a structure change, it draws without it', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });

    cache.receive(state(1, 'estructura'));
    await s.last().respond({ ok: false });

    expect(cache.drawable()?.state.version).toBe(1);
    expect(cache.drawable()?.geometries).toEqual({});
  });

  it('a malformed Geometry is reported as an error and not delivered', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));

    await s.last().respond({ ok: false, error: 'Geometria malformada en la Vista a' });

    expect(cache.drawable()?.geometries).toEqual({});
    expect(cache.drawable()?.errors).toEqual(['Geometria malformada en la Vista a']);
  });

  it('a response from before a structure change is discarded', async () => {
    const { s, cache } = assemble();
    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });
    cache.activate('b');
    const late = s.last();

    cache.receive(state(1, 'estructura'));
    expect(s.vistas()).toEqual(['a', 'b', 'b']);
    const fresh = geometry('b');
    await s.last().respond({ ok: true, geometry: fresh });
    await late.respond({ ok: true, geometry: geometry('b') });

    expect(cache.drawable()?.geometries['b']).toBe(fresh);
    expect(cache.drawable()?.geometries['a']).toBeUndefined();
  });

  it('notifies subscribers when the drawable changes', async () => {
    const { s, cache } = assemble();
    let notices = 0;
    cache.subscribe(() => (notices += 1));

    cache.receive(state(0));
    await s.last().respond({ ok: true, geometry: geometry('a') });

    expect(notices).toBeGreaterThan(0);
  });
});
