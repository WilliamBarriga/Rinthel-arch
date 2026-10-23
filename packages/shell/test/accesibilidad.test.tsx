import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nodo = (id: string, type: string) => ({ id, type, title: id.toUpperCase(), description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio', color: 'a' }, { name: 'base', color: 'b' }] },
  model: { nodes: [nodo('x', 'servicio'), nodo('y', 'base')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

function layoutContador() {
  const temas: string[] = [];
  const layout: AdaptadorDeLayout = async (vista: VistaResuelta, tema: Tema) => {
    temas.push(tema.name);
    const nodes: Geometria['nodes'] = {};
    vista.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, pinsSolapados: [], width: 300, height: 50 };
  };
  return { temas, layout };
}

const capaRelleno = { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'COLOR' } } };
const conColor = (tema: Partial<TemaResuelto> = {}): TemaResuelto =>
  ({ ...TEMA_NEUTRO, name: 'color', palette: { ...TEMA_NEUTRO.palette, a: '#cc0000', b: '#0000cc' }, nodo: { ...TEMA_NEUTRO.nodo, capas: [capaRelleno] }, ...tema }) as TemaResuelto;

/** Fondo del visor (variable del chrome): sale del Tema que se esta dibujando. */
const fondo = (contenedor: HTMLElement): string => (contenedor.querySelector('.rd-vista') as HTMLElement).style.getPropertyValue('--rd-fondo');

const montar = (layout: AdaptadorDeLayout, theme: TemaResuelto, extra: Record<string, unknown> = {}) =>
  render(<VistaInteractiva source={fuente} view="v" theme={theme} layout={layout} width={800} height={600} {...extra} />);

describe('alto contraste en el visor', () => {
  it('el interruptor reemplaza el Tema solo en el visor y se puede volver', async () => {
    const { temas, layout } = layoutContador();
    const { container, getByRole } = montar(layout, TEMA_NEUTRO);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());
    const boton = getByRole('button', { name: /alto contraste/i });
    expect(boton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(boton);
    await waitFor(() => expect(fondo(container)).toBe('#000000'));
    expect(boton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(boton);
    await waitFor(() => expect(fondo(container)).toBe('#ffffff'));
  });

  it('prefers-contrast: more lo activa de entrada', async () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('prefers-contrast: more'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { temas, layout } = layoutContador();
    const { container, getByRole } = montar(layout, TEMA_NEUTRO);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());

    expect(fondo(container)).toBe('#000000');
    expect(temas).toHaveLength(1);
    expect(getByRole('button', { name: /alto contraste/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('el estado controlado manda y avisa del cambio', async () => {
    const { layout } = layoutContador();
    const alCambiar = vi.fn();
    const { getByRole } = montar(layout, TEMA_NEUTRO, { highContrast: false, onHighContrastChange: alCambiar });
    fireEvent.click(getByRole('button', { name: /alto contraste/i }));

    expect(alCambiar).toHaveBeenCalledWith(true);
    expect(getByRole('button', { name: /alto contraste/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('leyenda derivada del Tema', () => {
  it('aparece sola cuando dos Tipos solo difieren por color, con Tipo, forma y color', async () => {
    const { layout } = layoutContador();
    const { container } = montar(layout, conColor());
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());

    const leyenda = container.querySelector('[data-leyenda]');
    expect(leyenda).not.toBeNull();
    expect(leyenda!.textContent).toContain('servicio');
    expect(leyenda!.textContent).toContain('base');
    expect(leyenda!.textContent).toContain('rect');
    expect(leyenda!.innerHTML).toContain('#cc0000');
  });

  it('no aparece si los Tipos se distinguen por mas que el color, salvo que se pida siempre', async () => {
    const distinto = conColor({ nodo: { ...TEMA_NEUTRO.nodo, capas: [capaRelleno], tipos: { base: [{ nombre: 'forma', primitiva: 'pill', props: {}, antes: 'relleno' }] } } as TemaResuelto['nodo'] });
    const { layout } = layoutContador();
    const { container } = montar(layout, distinto);
    await waitFor(() => expect(container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(container.querySelector('[data-leyenda]')).toBeNull();

    cleanup();
    const otro = montar(layout, distinto, { legend: 'always' });
    await waitFor(() => expect(otro.container.querySelector('[data-id="x"]')).not.toBeNull());
    expect(otro.container.querySelector('[data-leyenda]')).not.toBeNull();
  });
});
