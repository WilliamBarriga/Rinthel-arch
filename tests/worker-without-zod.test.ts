import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { workerAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

import { devUiAssets } from 'dev-ui';

/** The Worker bundle that the `dev-ui` build produces and `dev` serves. */
const devUiWorker = (): string => readFileSync(devUiAssets().files['worker.js']!, 'utf8');

/**
 * Runs the Worker bundle that `dev` serves (with inert zod) with a fake `self`: if anything it imports called zod,
 * it would fail here. Needs the built packages (including `dev-ui`).
 */
describe('bundled layout Worker', () => {
  it('computes the same geometry as layoutView without validating the Theme', async () => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'service' }] },
      model: {
        nodes: [
          { id: 'a', type: 'service', title: 'A', description: '', children: [] },
          { id: 'g', type: 'service', title: 'G', description: '', children: [{ id: 'g.b', type: 'service', title: 'B', description: '', children: [] }] },
        ],
        edges: [{ from: { node: 'a' }, to: { node: 'g.b' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: [] }],
    });
    const view = resolveView(source, 'v')!;
    const worker = devUiWorker();

    // Context with `self` as the global, like a Web Worker.
    const global: Record<string, unknown> & { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown) => void } = { setTimeout, clearTimeout, queueMicrotask, console };
    global.self = global;
    const response = new Promise<{ geometry?: unknown; error?: string }>((ok) => {
      global.postMessage = (m) => ok(m as never);
    });
    runInNewContext(worker, global);

    // The page builds the request with its adapter; the Worker only sees Metrics.
    const request = new Promise<unknown>((ok) => {
      void workerAdapter({ postMessage: ok, onmessage: null })(view, NEUTRAL_THEME);
    });
    global.onmessage!({ data: await request });

    const { geometry, error } = await response;
    expect(error).toBeUndefined();
    // ELK does not position inside a `vm` (without its own Worker), but the size of each box and its Slots
    // come from the Metrics the Worker received, and must be the same as with the Theme directly.
    const sizes = (g: Awaited<ReturnType<typeof layoutView>>): unknown =>
      Object.fromEntries(Object.entries(g.nodes).filter(([id]) => id !== 'g').map(([id, c]) => [id, { w: c.width, h: c.height, slots: c.slots }]));
    expect(sizes(geometry as never)).toEqual(sizes(await layoutView(view, NEUTRAL_THEME)));
  }, 30_000);

  it('a sequence View gives the same geometry in the Worker as in Node', async () => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'service' }] },
      model: {
        nodes: [
          { id: 'a', type: 'service', title: 'A', description: '', children: [] },
          { id: 'b', type: 'service', title: 'B', description: '', children: [] },
        ],
        edges: [],
        interactions: [{ id: 'i', title: 'I', items: [{ type: 'message', from: 'a', to: 'b', label: 'request' }, { type: 'message', kind: 'reply', from: 'b', to: 'a' }] }],
      },
      views: [{ id: 'v', type: 'sequence', interaction: 'i' }],
    });
    const view = resolveView(source, 'v')!;
    const worker = devUiWorker();
    const global: Record<string, unknown> & { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown) => void } = { setTimeout, clearTimeout, queueMicrotask, console };
    global.self = global;
    const response = new Promise<{ geometry?: unknown; error?: string }>((ok) => {
      global.postMessage = (m) => ok(m as never);
    });
    runInNewContext(worker, global);
    const request = new Promise<unknown>((ok) => {
      void workerAdapter({ postMessage: ok, onmessage: null })(view, NEUTRAL_THEME);
    });
    global.onmessage!({ data: await request });

    const { geometry, error } = await response;
    expect(error).toBeUndefined();
    expect(geometry).toEqual(await layoutView(view, NEUTRAL_THEME));
    expect((geometry as { kind: string }).kind).toBe('secuencia');
  }, 30_000);
});
