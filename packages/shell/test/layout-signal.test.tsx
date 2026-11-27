import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('a'), node('b')], edges: [] },
  views: [
    { id: 'uno', type: 'architecture', include: ['**'], exclude: [] },
    { id: 'dos', type: 'architecture', include: ['a'], exclude: [] },
  ],
});

/** Adapter whose result is released by hand, to observe the state while ELK works. */
function manualAdapter(): { layout: LayoutAdapter; release: () => void } {
  const pending: Array<() => void> = [];
  const layout: LayoutAdapter = (view: ResolvedView) =>
    new Promise<Geometry>((resolve) => {
      const nodes: Geometry['nodes'] = {};
      view.nodes.forEach((n, i) => {
        nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
      });
      pending.push(() => resolve({ nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 }));
    });
  return { layout, release: () => act(() => pending.splice(0).forEach((f) => f())) as unknown as void };
}

const zone = (c: HTMLElement) => c.querySelector('.rd-vista')!;

describe('layout signal of the View container', () => {
  it('marks computing while the layout works and ready when it arrives, with the active View', async () => {
    const { layout, release } = manualAdapter();
    const { container } = render(<InteractiveView source={source} view="uno" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
    expect(zone(container).getAttribute('data-layout')).toBe('calculando');
    expect(zone(container).getAttribute('data-vista')).toBe('uno');
    release();
    await waitFor(() => expect(zone(container).getAttribute('data-layout')).toBe('listo'));
    expect(zone(container).getAttribute('data-vista')).toBe('uno');
  });

  it('goes back to computing on View change until its layout arrives', async () => {
    const { layout, release } = manualAdapter();
    const { container, rerender } = render(<InteractiveView source={source} view="uno" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
    release();
    await waitFor(() => expect(zone(container).getAttribute('data-layout')).toBe('listo'));
    rerender(<InteractiveView source={source} view="dos" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
    expect(zone(container).getAttribute('data-layout')).toBe('calculando');
    expect(zone(container).getAttribute('data-vista')).toBe('dos');
    release();
    await waitFor(() => expect(zone(container).getAttribute('data-layout')).toBe('listo'));
  });
});
