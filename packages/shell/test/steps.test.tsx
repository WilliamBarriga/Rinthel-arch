import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema, edgeId } from 'canonical';
import type { GraphGeometry, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter, InteractiveViewProps } from 'shell';
import { NEUTRAL_THEME } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

const source = (steps: unknown[]) =>
  canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [node('a'), node('b'), node('c')],
      edges: [
        { from: { node: 'a' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps }],
  });

const steps = [
  { title: 'Entrada', show: [{ selector: 'a' }, { selector: 'b' }] },
  { title: 'Salida', show: [{ selector: 'c' }] },
];

const inRow: LayoutAdapter = async (view: ResolvedView) => {
  const nodes: GraphGeometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  const edges: GraphGeometry['edges'] = {};
  for (const e of view.type === 'sequence' ? [] : view.edges) {
    const d = nodes[e.from.node]!;
    const h = nodes[e.to.node]!;
    edges[edgeId(e)] = { points: [{ x: d.x + 100, y: 25 }, { x: h.x, y: 25 }] };
  }
  return { nodes, edges, labels: {}, kind: 'grafo', pinsSolapados: [], width: 500, height: 50 };
};

const mount = (steps: unknown[], extra: Partial<InteractiveViewProps> = {}) =>
  render(
    <InteractiveView source={source(steps)} view="v" theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={{ x: 0, y: 0, width: 800, height: 600 }} {...extra} />,
  );

const opacity = (c: HTMLElement, id: string): number => {
  const el = c.querySelector(`[data-id="${id}"], [data-edge="${id}"]`);
  const part = el?.querySelector<HTMLElement>('[data-part]');
  const v = part != null ? part.style.opacity : el?.getAttribute('opacity');
  return v === null || v === undefined || v === '' ? 1 : Number(v);
};
const waitForDrawn = (c: HTMLElement) => waitFor(() => expect(c.querySelector('[data-id="a"]')).not.toBeNull());
const withoutVisibility = (c: HTMLElement) =>
  c.querySelector('[data-diagram]')!.innerHTML.replace(/ data-oculto=""/g, '').replace(/ opacity="[^"]*"/g, '').replace(/\s*(opacity|pointer-events): [^;"]+;?/g, '').replace(/ pointer-events="[^"]*"/g, '');

describe('initial Step per Diagram type', () => {
  it('an ER View with Steps mounts at the first one, not empty; architecture stays at 0', async () => {
    const er = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('a'), node('b')], edges: [] },
      views: [{ id: 'v', type: 'er', include: ['**'], exclude: [], steps: [{ title: 'Tablas', show: [{ selector: 'a' }] }] }],
    });
    const { container } = render(<InteractiveView source={er} view="v" theme={NEUTRAL_THEME} layout={inRow} width={800} height={600} camera={{ x: 0, y: 0, width: 800, height: 600 }} />);
    await waitForDrawn(container);
    expect(container.querySelector('[data-pasos]')?.textContent).toContain('Step 1 of 1: Tablas');
    expect(opacity(container, 'a')).toBe(1);
    cleanup();
    const { container: arch } = mount(steps);
    await waitForDrawn(arch);
    expect(arch.querySelector('[data-pasos]')?.textContent).toContain('Step 0 of 2');
  });
});

describe('previous and next Steps', () => {
  it('without steps there are no controls and nothing is hidden', async () => {
    const { container } = mount([]);
    await waitForDrawn(container);
    expect(screen.queryByRole('button', { name: 'Next step' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous step' })).toBeNull();
    expect(opacity(container, 'c')).toBe(1);
  });

  it('next reveals Nodes and Edges cumulatively', async () => {
    const { container } = mount(steps);
    await waitForDrawn(container);
    expect(opacity(container, 'a')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(opacity(container, 'a')).toBe(1);
    expect(opacity(container, 'b')).toBe(1);
    expect(opacity(container, 'c')).toBe(0);
    expect(opacity(container, 'a -> b')).toBe(1);
    expect(opacity(container, 'b -> c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(opacity(container, 'a')).toBe(1);
    expect(opacity(container, 'c')).toBe(1);
    expect(opacity(container, 'b -> c')).toBe(1);
  });

  it('previous hides what the last Step revealed; the buttons are disabled at the ends', async () => {
    const { container } = mount(steps, { defaultStep: 2 });
    await waitForDrawn(container);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next step' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(opacity(container, 'c')).toBe(0);
    expect(opacity(container, 'a')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous step' }).disabled).toBe(true);
  });

  it('the geometry does not change between Steps', async () => {
    const { container } = mount(steps);
    await waitForDrawn(container);
    const before = withoutVisibility(container);
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(withoutVisibility(container)).toBe(before);
  });

  it('the Step controlled by props reports with onStepChange and does not move on its own', async () => {
    const onStepChange = vi.fn();
    const { container } = mount(steps, { step: 1, onStepChange });
    await waitForDrawn(container);
    expect(opacity(container, 'c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onStepChange).toHaveBeenCalledWith(2);
    expect(opacity(container, 'c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(onStepChange).toHaveBeenLastCalledWith(0);
  });

  it('shows the position and the title of the current Step', async () => {
    const { container } = mount(steps, { step: 1 });
    await waitForDrawn(container);
    expect(screen.getByText('Step 1 of 2: Entrada')).toBeTruthy();
  });
});
