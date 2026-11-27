import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { CanonicalForm, Geometry } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, Camera } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import { positionOf } from './helpers';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const source = (overrides: unknown[]): CanonicalForm =>
  canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [node('a'), node('b')], edges: [] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides }],
  });
const withPin = (x: number, y: number) => source([{ node: 'b', pin: { x, y } }]);

const camera: Camera = { x: 0, y: 0, width: 800, height: 600 };

describe('moving a Pin in the shell', () => {
  it('does not call the layout adapter again and shows the new Pin', async () => {
    const layout = vi.fn<LayoutAdapter>(async (view) => ({
      nodes: Object.fromEntries(view.nodes.map((n, i) => [n.id, { x: i * 200, y: 0, width: 100, height: 50 }])),
      edges: {},
      labels: {},
      kind: 'grafo',
      pinsSolapados: [],
      width: 300,
      height: 50,
    } satisfies Geometry));
    const props = (source: CanonicalForm) => ({ source, view: 'v', theme: NEUTRAL_THEME, layout, width: 800, height: 600, camera });
    const { container, rerender } = render(<InteractiveView {...props(source([]))} />);
    await waitFor(() => expect(positionOf(container, 'b')).toEqual([200, 0]));

    rerender(<InteractiveView {...props(withPin(500, 300))} />);
    await waitFor(() => expect(positionOf(container, 'b')).toEqual([450, 275])); // the Pin anchors the center: corner = Pin - half the box (100x50)
    rerender(<InteractiveView {...props(withPin(510, 310))} />);
    await waitFor(() => expect(positionOf(container, 'b')).toEqual([460, 285]));

    expect(layout).toHaveBeenCalledTimes(1);
  });
});
