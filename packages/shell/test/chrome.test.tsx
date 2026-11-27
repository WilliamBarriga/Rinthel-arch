import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, Theme } from 'canonical';
import { InteractiveView } from 'shell';
import type { LayoutAdapter } from 'shell';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

afterEach(cleanup);

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [node('a'), node('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps: [{ title: 'uno', show: [{ selector: 'a' }] }] }],
});
const layout: LayoutAdapter = async (view) => {
  const nodes: Geometry['nodes'] = {};
  view.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
};
const DARK: ResolvedTheme = {
  ...NEUTRAL_THEME,
  name: 'oscuro',
  palette: { ...NEUTRAL_THEME.palette, blue: '#60a5fa' },
  tokens: { background: '#111827', foreground: '#f9fafb', border: '#4b5563' },
};

const mount = (theme: Theme) => render(<InteractiveView source={source} view="v" theme={theme} layout={layout} width={800} height={600} />);

describe('shell chrome', () => {
  it('takes its colors from CSS variables derived from the dark Theme Style', async () => {
    const { container } = mount(DARK);
    await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());
    const root = container.firstElementChild as HTMLElement;

    expect(root.style.getPropertyValue('--rd-fondo')).toBe('#111827');
    expect(root.style.getPropertyValue('--rd-texto')).toBe('#f9fafb');
    expect(root.style.getPropertyValue('--rd-borde')).toBe('#4b5563');
    expect(root.style.getPropertyValue('--rd-acento')).toBe('#60a5fa');
  });

  it('with the light Theme the variables are those of the light Theme', () => {
    const root = mount(NEUTRAL_THEME).container.firstElementChild as HTMLElement;

    expect(root.style.getPropertyValue('--rd-fondo')).toBe('#ffffff');
  });

  it('steps and breadcrumbs use classes and no inline style', async () => {
    const { container } = mount(DARK);
    await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());

    for (const el of [container.querySelector('[data-pasos]')!, container.querySelector('[data-breadcrumbs]')!]) {
      expect(el.getAttribute('style')).toBeNull();
      expect(el.className).toContain('rd-');
    }
  });

  it('the chrome CSS uses only variables for its colors', () => {
    const { container } = mount(DARK);
    const css = container.querySelector('style[data-rd-chrome]')!.textContent!;

    expect(css).toContain('var(--rd-fondo)');
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  describe('optional chrome (issues, toasts, legend, breadcrumbs)', () => {
    const issue = { severity: 'error' as const, code: 'E_X', message: 'roto', file: 'main.dg', line: 1, column: 1, href: '#' };
    const mountWithChrome = (chrome?: boolean) =>
      render(
        <InteractiveView source={source} view="v" theme={NEUTRAL_THEME} layout={layout} width={800} height={600} legend="always" issues={[issue]} toasts={['hola']} {...(chrome !== undefined && { chrome })} />,
      );

    it('by default draws issues, toasts, legend and breadcrumbs', async () => {
      const { container } = mountWithChrome();
      await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());
      expect(container.querySelector('[data-panel="issues"]')).not.toBeNull();
      expect(container.querySelector('.rd-toast')).not.toBeNull();
      expect(container.querySelector('[data-leyenda]')).not.toBeNull();
      expect(container.querySelector('[data-breadcrumbs]')).not.toBeNull();
    });

    it('with chrome={false} draws no issues, toasts, legend nor breadcrumbs', async () => {
      const { container } = mountWithChrome(false);
      await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
      expect(container.querySelector('[data-panel="issues"]')).toBeNull();
      expect(container.querySelector('.rd-toast')).toBeNull();
      expect(container.querySelector('[data-leyenda]')).toBeNull();
      expect(container.querySelector('[data-breadcrumbs]')).toBeNull();
    });
  });
});
