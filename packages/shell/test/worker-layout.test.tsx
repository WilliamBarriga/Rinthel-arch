import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { InteractiveView, workerAdapter, serveLayout } from 'shell';
import type { LayoutPort } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { positionOf } from './helpers';

afterEach(cleanup);

/** In-memory port pair that copies messages as a Worker would (structured clone, asynchronous). */
function portPair(): [LayoutPort, LayoutPort] {
  const create = (): LayoutPort & { target?: LayoutPort } => {
    const port: LayoutPort & { target?: LayoutPort } = {
      onmessage: null,
      postMessage(message) {
        const copy = structuredClone(message);
        setTimeout(() => port.target?.onmessage?.({ data: copy }), 0);
      },
    };
    return port;
  };
  const a = create();
  const b = create();
  a.target = b;
  b.target = a;
  return [a, b];
}

const node = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [node('c', 'C'), node('g', 'G', [node('g.a', 'A'), node('g.b', 'B')])],
    edges: [{ from: { node: 'c' }, to: { node: 'g.a' } }],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: ['g'] }],
});

describe('layout in a Worker', () => {
  it('gives the same geometry as layoutView directly (same code in Node and Worker)', async () => {
    const [page, worker] = portPair();
    serveLayout(worker);
    const view = resolveView(source, 'v', { expanded: ['g'] })!;
    const viaWorker = await workerAdapter(page)(view, NEUTRAL_THEME);
    expect(viaWorker).toEqual(await layoutView(view, NEUTRAL_THEME));
  });

  it('a layout failure in the Worker rejects the adapter promise', async () => {
    const [page, worker] = portPair();
    serveLayout(worker, { elk: { layout: () => Promise.reject(new Error('elk roto')) } as never });
    const view = resolveView(source, 'v')!;
    await expect(workerAdapter(page)(view, NEUTRAL_THEME)).rejects.toThrow('elk roto');
  });

  it('integration with real ELK: expanding a Group keeps its screen position', async () => {
    const [page, worker] = portPair();
    serveLayout(worker);
    const { container } = render(
      <InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={workerAdapter(page)} width={800} height={600} morphMs={0} />,
    );
    const ids = () => [...container.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
    const screen = () => {
      const t = positionOf(container, 'g')!;
      const vb = container.querySelector('[data-diagram]')!.getAttribute('data-camara')!.split(' ').map(Number);
      return [t[0] - vb[0]!, t[1] - vb[1]!];
    };
    await waitFor(() => expect(ids()).toEqual(['c', 'g']), { timeout: 5000 });
    const before = screen();

    fireEvent.click(container.querySelector('[data-toggle="g"]')!);
    await waitFor(() => expect(ids()).toContain('g.a'), { timeout: 5000 });
    expect(screen()[0]).toBeCloseTo(before[0]!, 5);
    expect(screen()[1]).toBeCloseTo(before[1]!, 5);
  });
});
