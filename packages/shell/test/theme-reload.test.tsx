import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, Theme, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
  model: { nodes: [node('a'), node('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

/** Fake layout that counts calls and remembers the View and the Theme it received. */
function countingLayout() {
  const calls: { view: ResolvedView; theme: Theme }[] = [];
  const layout: LayoutAdapter = async (view, theme) => {
    calls.push({ view, theme });
    const nodes: Geometry['nodes'] = {};
    view.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
  };
  return { llamadas: calls, layout };
}

const mount = (layout: LayoutAdapter) =>
  render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} />);
const withTheme = (layout: LayoutAdapter, theme: Theme) => (
  <InteractiveView source={source} view="v" theme={theme} layout={layout} width={800} height={600} />
);

describe('Theme change from the parent', () => {
  it('a palette change recolors without relayout nor recomputing the View', async () => {
    const { llamadas: calls, layout } = countingLayout();
    const { container, rerender } = mount(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const before = container.innerHTML;
    rerender(withTheme(layout, { ...NEUTRAL_THEME, palette: { ...NEUTRAL_THEME.palette, blue: '#ff0000' } }));
    await waitFor(() => expect(container.innerHTML).not.toBe(before));
    expect(container.innerHTML).toContain('#ff0000');
    expect(calls).toHaveLength(1);
  });

  it('a font change relayouts with the new Theme and the same View', async () => {
    const { llamadas: calls, layout } = countingLayout();
    const { container, rerender } = mount(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const latest = { ...NEUTRAL_THEME, fonts: { ...NEUTRAL_THEME.fonts, body: 'Courier Mono' } };
    rerender(withTheme(layout, latest));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.theme).toBe(latest);
    expect(calls[1]!.view).toBe(calls[0]!.view);
  });

  it('a text size change relayouts', async () => {
    const { llamadas: calls, layout } = countingLayout();
    const { container, rerender } = mount(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    rerender(withTheme(layout, { ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: '22px' } }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });
});
