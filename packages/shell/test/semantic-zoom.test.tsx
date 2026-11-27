import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, ResolvedView } from 'canonical';
import { InteractiveView, detailLevel } from 'shell';
import type { LayoutAdapter, Camera } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'tabla', icon: 'database' }, { name: 'grupo' }] },
  model: {
    nodes: [
      {
        id: 'g',
        type: 'grupo',
        title: 'Grupo completo',
        description: '',
        children: [
          { id: 'g.u', type: 'tabla', title: 'Usuarios del sistema', description: '', children: [], attributes: [{ name: 'id', type: 'uuid' }] },
        ],
      },
    ],
    edges: [],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'g.u', label: 'Usr' }] }],
});

const fixed: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: Geometry['nodes'] = { g: { x: 0, y: 0, width: 400, height: 200 } };
  for (const child of view.nodes[0]!.children) nodes[child.id] = { x: 20, y: 40, width: 200, height: 100 };
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 400, height: 200 };
};

const withWidth = (width: number): Camera => ({ x: 0, y: 0, width, height: (width * 600) / 800 });
const mount = (camera: Camera) =>
  render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={fixed} width={800} height={600} camera={camera} />);

describe('detailLevel', () => {
  it('chooses the level by scale', () => {
    expect(detailLevel(0.1)).toBe('etiqueta');
    expect(detailLevel(0.5)).toBe('titulo');
    expect(detailLevel(1)).toBe('completo');
    expect(detailLevel(16)).toBe('completo');
  });

  it('respects its own thresholds and is inclusive at the limit', () => {
    const thresholds = { title: 1, full: 2 };
    expect(detailLevel(0.99, thresholds)).toBe('etiqueta');
    expect(detailLevel(1, thresholds)).toBe('titulo');
    expect(detailLevel(2, thresholds)).toBe('completo');
  });
});

describe('InteractiveView: semantic zoom', () => {
  it('at scale 1 shows the View label (override included) and the Attributes', async () => {
    const { container } = mount(withWidth(800));
    await waitFor(() => expect(container.textContent).toContain('id: uuid'));
    expect(container.textContent).toContain('Usr');
    expect(container.textContent).not.toContain('Usuarios del sistema');
  });

  it('at medium scale shows the label without Attributes', async () => {
    const { container } = mount(withWidth(1600));
    await waitFor(() => expect(container.textContent).toContain('Usr'));
    expect(container.textContent).not.toContain('Usuarios del sistema');
    expect(container.textContent).not.toContain('id: uuid');
  });

  it('at low scale shows the short label', async () => {
    const { container } = mount(withWidth(4000));
    await waitFor(() => expect(container.textContent).toContain('Usr'));
    expect(container.textContent).not.toContain('Usuarios del sistema');
    expect(container.textContent).not.toContain('id: uuid');
  });

  it('the geometry and the structure are identical between levels; zoom does not collapse', async () => {
    const shape = async (width: number) => {
      const { container, unmount } = mount(withWidth(width));
      await waitFor(() => expect(container.querySelector('[data-id="g.u"]')).not.toBeNull());
      const data = {
        ids: [...container.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')),
        boxes: [...container.querySelectorAll<HTMLElement>('[data-id]')].map((e) => [e.style.transform, e.style.width, e.style.height]),
        toggles: container.querySelectorAll('[data-toggle]').length,
      };
      unmount();
      return data;
    };
    const full = await shape(800);
    expect(await shape(1600)).toEqual(full);
    expect(await shape(4000)).toEqual(full);
    expect(full.ids).toEqual(['g', 'g.u']);
  });
});
