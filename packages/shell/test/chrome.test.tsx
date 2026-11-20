import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { Geometria, Tema } from 'canonico';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('a'), nodo('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps: [{ title: 'uno', show: [{ selector: 'a' }] }] }],
});
const layout: AdaptadorDeLayout = async (vista) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
};
const OSCURO: TemaResuelto = {
  ...TEMA_NEUTRO,
  name: 'oscuro',
  palette: { ...TEMA_NEUTRO.palette, blue: '#60a5fa' },
  tokens: { background: '#111827', foreground: '#f9fafb', border: '#4b5563' },
};

const montar = (tema: Tema) => render(<VistaInteractiva source={fuente} view="v" theme={tema} layout={layout} width={800} height={600} />);

describe('chrome del shell', () => {
  it('toma sus colores de variables CSS derivadas del Estilo del Tema oscuro', async () => {
    const { container } = montar(OSCURO);
    await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());
    const raiz = container.firstElementChild as HTMLElement;

    expect(raiz.style.getPropertyValue('--rd-fondo')).toBe('#111827');
    expect(raiz.style.getPropertyValue('--rd-texto')).toBe('#f9fafb');
    expect(raiz.style.getPropertyValue('--rd-borde')).toBe('#4b5563');
    expect(raiz.style.getPropertyValue('--rd-acento')).toBe('#60a5fa');
  });

  it('con el Tema claro las variables son las del Tema claro', () => {
    const raiz = montar(TEMA_NEUTRO).container.firstElementChild as HTMLElement;

    expect(raiz.style.getPropertyValue('--rd-fondo')).toBe('#ffffff');
  });

  it('pasos y migas usan clases y ningun estilo en linea', async () => {
    const { container } = montar(OSCURO);
    await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());

    for (const el of [container.querySelector('[data-pasos]')!, container.querySelector('[data-breadcrumbs]')!]) {
      expect(el.getAttribute('style')).toBeNull();
      expect(el.className).toContain('rd-');
    }
  });

  it('el CSS del chrome usa solo variables para sus colores', () => {
    const { container } = montar(OSCURO);
    const css = container.querySelector('style[data-rd-chrome]')!.textContent!;

    expect(css).toContain('var(--rd-fondo)');
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  describe('chrome opcional (issues, toasts, leyenda, migas)', () => {
    const issue = { severity: 'error' as const, code: 'E_X', message: 'roto', file: 'main.dg', line: 1, column: 1, href: '#' };
    const montarConChrome = (chrome?: boolean) =>
      render(
        <VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} legend="always" issues={[issue]} toasts={['hola']} {...(chrome !== undefined && { chrome })} />,
      );

    it('por defecto dibuja issues, toasts, leyenda y migas', async () => {
      const { container } = montarConChrome();
      await waitFor(() => expect(container.querySelector('[data-pasos]')).not.toBeNull());
      expect(container.querySelector('[data-panel="issues"]')).not.toBeNull();
      expect(container.querySelector('.rd-toast')).not.toBeNull();
      expect(container.querySelector('[data-leyenda]')).not.toBeNull();
      expect(container.querySelector('[data-breadcrumbs]')).not.toBeNull();
    });

    it('con chrome={false} no dibuja issues, toasts, leyenda ni migas', async () => {
      const { container } = montarConChrome(false);
      await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
      expect(container.querySelector('[data-panel="issues"]')).toBeNull();
      expect(container.querySelector('.rd-toast')).toBeNull();
      expect(container.querySelector('[data-leyenda]')).toBeNull();
      expect(container.querySelector('[data-breadcrumbs]')).toBeNull();
    });
  });
});
