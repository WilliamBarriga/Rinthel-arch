import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, Theme, ResolvedView } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const node = (id: string, type: string) => ({ id, type, title: id.toUpperCase(), description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio', color: 'a' }, { name: 'base', color: 'b' }] },
  model: { nodes: [node('x', 'servicio'), node('y', 'base')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

function countingLayout() {
  const themeList: string[] = [];
  const layout: LayoutAdapter = async (view: ResolvedView, theme: Theme) => {
    themeList.push(theme.name);
    const nodes: Geometry['nodes'] = {};
    view.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
  };
  return { temas: themeList, layout };
}

const fillLayer = { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'COLOR' } } };
const withColor = (theme: Partial<ResolvedTheme> = {}): ResolvedTheme =>
  ({ ...NEUTRAL_THEME, name: 'color', palette: { ...NEUTRAL_THEME.palette, a: '#cc0000', b: '#0000cc' }, nodo: { ...NEUTRAL_THEME.nodo, capas: [fillLayer] }, ...theme }) as ResolvedTheme;

/** Viewer background (chrome variable): it comes from the Theme being drawn. */
const background = (container: HTMLElement): string => (container.querySelector('.rd-vista') as HTMLElement).style.getPropertyValue('--rd-fondo');

const mount = (layout: LayoutAdapter, theme: ResolvedTheme, extra: Record<string, unknown> = {}) =>
  render(<InteractiveView source={source} view="v" theme={theme} layout={layout} width={800} height={600} {...extra} />);

describe('high contrast in the viewer', () => {
  it('the toggle replaces the Theme only in the viewer and can be turned back', async () => {
    const { layout } = countingLayout();
    const { container, getByRole } = mount(layout, NEUTRAL_THEME);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());
    const btn = getByRole('button', { name: /high contrast/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);
    await waitFor(() => expect(background(container)).toBe('#000000'));
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(btn);
    await waitFor(() => expect(background(container)).toBe('#ffffff'));
  });

  it('prefers-contrast: more turns it on from the start', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-contrast: more'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { temas: themeList, layout } = countingLayout();
    const { container, getByRole } = mount(layout, NEUTRAL_THEME);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());

    expect(background(container)).toBe('#000000');
    expect(themeList).toHaveLength(1);
    expect(getByRole('button', { name: /high contrast/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('the controlled state rules and reports the change', async () => {
    const { layout } = countingLayout();
    const handleChange = vi.fn();
    const { getByRole } = mount(layout, NEUTRAL_THEME, { highContrast: false, onHighContrastChange: handleChange });
    fireEvent.click(getByRole('button', { name: /high contrast/i }));

    expect(handleChange).toHaveBeenCalledWith(true);
    expect(getByRole('button', { name: /high contrast/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('legend derived from the Theme', () => {
  it('appears on its own when two Node kinds differ only by color, with Node kind, shape and color', async () => {
    const { layout } = countingLayout();
    const { container } = mount(layout, withColor());
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());

    const legendEl = container.querySelector('[data-leyenda]');
    expect(legendEl).not.toBeNull();
    expect(legendEl!.textContent).toContain('servicio');
    expect(legendEl!.textContent).toContain('base');
    expect(legendEl!.textContent).toContain('rect');
    expect(legendEl!.innerHTML).toContain('#cc0000');
    expect(legendEl!.getAttribute('aria-label')).toBe('Legend');
  });

  it('does not appear if the Node kinds differ by more than color, unless always requested', async () => {
    const different = withColor({ nodo: { ...NEUTRAL_THEME.nodo, capas: [fillLayer], tipos: { base: [{ nombre: 'forma', primitiva: 'pill', props: {}, antes: 'relleno' }] } } as ResolvedTheme['nodo'] });
    const { layout } = countingLayout();
    const { container } = mount(layout, different);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(container.querySelector('[data-leyenda]')).toBeNull();

    cleanup();
    const another = mount(layout, different, { legend: 'always' });
    await waitFor(() => expect(another.container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(another.container.querySelector('[data-leyenda]')).not.toBeNull();
  });
});

describe('legend per Diagram type of the View', () => {
  it('a badge the Theme only sets in diagram flow tells the Node kinds apart in the flow View, not in the architecture one', async () => {
    const withBadge = { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'badge' }] };
    const theme = withColor({ nodo: { ...NEUTRAL_THEME.nodo, capas: [fillLayer], diagramas: { flow: { ops: [], slots: withBadge } } } as ResolvedTheme['nodo'] });
    const withFlow = canonicalFormSchema.parse({ ...source, views: [...source.views, { id: 'f', type: 'flow', include: ['**'], exclude: [] }] });
    const { layout } = countingLayout();
    const mountView = (view: string) => render(<InteractiveView source={withFlow} view={view} theme={theme} layout={layout} width={800} height={600} />);

    const flow = mountView('f');
    await waitFor(() => expect(flow.container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(flow.container.querySelector('[data-leyenda]')).toBeNull();
    cleanup();
    const architecture = mountView('v');
    await waitFor(() => expect(architecture.container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(architecture.container.querySelector('[data-leyenda]')).not.toBeNull();
  });
});

describe('manual reduced-motion toggle', () => {
  const mountApp = () => render(<InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={countingLayout().layout} width={800} height={600} />);
  const mark = (c: HTMLElement) => c.querySelector('[data-reduced-motion]')?.getAttribute('data-reduced-motion');

  it('untouched, the system preference rules: the Diagram has no attribute', async () => {
    const { container, getByRole } = mountApp();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(mark(container)).toBeUndefined();
    expect(getByRole('button', { name: 'Reduce motion' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('turning it on sets data-reduced-motion=on and turning it off sets off, even if the system does not ask', async () => {
    const { container, getByRole } = mountApp();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    fireEvent.click(getByRole('button', { name: 'Reduce motion' }));
    expect(mark(container)).toBe('on');
    expect(getByRole('button', { name: 'Reduce motion' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByRole('button', { name: 'Reduce motion' }));
    expect(mark(container)).toBe('off');
  });

  it('is independent of prefers-reduced-motion: with the system on reduce it starts pressed and can be turned off', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion'), addEventListener: () => undefined, removeEventListener: () => undefined }));
    const { container, getByRole } = mountApp();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(getByRole('button', { name: 'Reduce motion' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByRole('button', { name: 'Reduce motion' }));
    expect(mark(container)).toBe('off');
  });
});
