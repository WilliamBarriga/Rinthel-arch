import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, resolveView } from 'canonico';
import type { EstadoDeColapso, VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nodo = (id: string, title: string, children: unknown[] = []) => ({ id, type: 'servicio', title, description: '', children });

/** c (hoja) y g (Grupo de tres hijos, cerrado por defecto). */
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [nodo('c', 'C'), nodo('g', 'G', [nodo('g.a', 'A'), nodo('g.b', 'B'), nodo('g.c', 'C2')])],
    edges: [],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], collapsed: ['g'] }],
});

/**
 * Adaptador en memoria: Nodos raiz en fila, centrados en 800. Un Grupo abierto
 * es mas ancho, asi que abrirlo mueve a los demas (el caso que la camara compensa).
 */
function enFilaCentrada(llamadas: { n: number }): AdaptadorDeLayout {
  return async (vista) => {
    llamadas.n++;
    return geometriaCentrada(vista);
  };
}

function geometriaCentrada(vista: VistaResuelta): Geometria {
  const ancho = (n: VistaResuelta['nodes'][number]): number => (n.children.length > 0 ? n.children.length * 110 + 20 : 100);
  const anidados = new Set(vista.nodes.flatMap((n) => n.children.map((h) => h.id)));
  const raices = vista.nodes.filter((n) => !anidados.has(n.id));
  const total = raices.reduce((s, n) => s + ancho(n), 0) + 20 * (raices.length - 1);
  const nodes: Geometria['nodes'] = {};
  let x = 400 - total / 2;
  for (const n of raices) {
    nodes[n.id] = { x, y: 0, width: ancho(n), height: n.children.length > 0 ? 100 : 50 };
    n.children.forEach((h, i) => {
      nodes[h.id] = { x: 10 + i * 110, y: 40, width: 100, height: 50 };
    });
    x += ancho(n) + 20;
  }
  return { nodes, edges: {}, pinsSolapados: [], width: 800, height: 100 };
}

const camaraInicial: Camara = { x: 0, y: 0, width: 800, height: 600 };
const ids = (c: HTMLElement) => [...c.querySelectorAll('svg [data-id]')].map((e) => e.getAttribute('data-id'));
const alternar = (c: HTMLElement, id: string) => fireEvent.click(c.querySelector(`[data-toggle="${id}"]`)!);
/** x en pantalla del Nodo raiz `id`: su translate menos el origen del viewBox (escala 1). */
function xEnPantalla(c: HTMLElement, id: string): number {
  const caja = /translate\(([-\d.]+)/.exec(c.querySelector(`[data-id="${id}"]`)!.getAttribute('transform')!)![1]!;
  return Number(caja) - Number(c.querySelector('svg[viewBox]')!.getAttribute('viewBox')!.split(' ')[0]);
}

function montar(extra: Partial<VistaInteractivaProps> = {}, llamadas = { n: 0 }) {
  const props: VistaInteractivaProps = {
    source: fuente,
    view: 'v',
    theme: TEMA_NEUTRO,
    layout: enFilaCentrada(llamadas),
    width: 800,
    height: 600,
    morphMs: 0,
    ...extra,
  };
  return { llamadas, ...render(<VistaInteractiva {...props} />) };
}

describe('colapso y expansion', () => {
  it('expandir un Grupo relayouta y muestra sus hijos; colapsar los oculta', async () => {
    const { container } = montar();
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g', 'g.a', 'g.b', 'g.c']));

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
  });

  it('el Grupo tocado no cambia de posicion en pantalla', async () => {
    const { container } = montar();
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    const antes = xEnPantalla(container, 'g');

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(xEnPantalla(container, 'g')).toBe(antes);

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).not.toContain('g.a'));
    expect(xEnPantalla(container, 'g')).toBe(antes);
  });

  it('con camara controlada avisa de la camara compensada', async () => {
    const onCameraChange = vi.fn();
    const { container } = montar({ camera: camaraInicial, onCameraChange });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    alternar(container, 'g');
    // g pasa de x=410 (total 220) a x=285 (total 470): la camara se desplaza -125.
    await waitFor(() => expect(onCameraChange).toHaveBeenCalledWith({ x: -125, y: 0, width: 800, height: 600 }));
  });

  it('el estado por defecto usa la geometria cacheada sin relayout, y un estado ya visto tampoco', async () => {
    const llamadas = { n: 0 };
    const cerrado = geometriaCentrada(resolveView(fuente, 'v')!);
    const { container } = montar({ cachedGeometry: cerrado }, llamadas);
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    expect(llamadas.n).toBe(0);

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(llamadas.n).toBe(1);

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).not.toContain('g.a'));
    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    expect(llamadas.n).toBe(1);
  });

  it('el estado controlado manda: avisa con onStateChange y no se expande solo', async () => {
    const onStateChange = vi.fn<(estado: EstadoDeColapso) => void>();
    const { container } = montar({ state: {}, onStateChange });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    alternar(container, 'g');
    expect(onStateChange).toHaveBeenCalledWith({ expanded: ['g'], collapsed: [] });
    await act(async () => {});
    expect(ids(container)).toEqual(['c', 'g']);
  });

  it('rechaza una expansion que supera maxNodes', async () => {
    const onLimit = vi.fn();
    const { container, llamadas } = montar({ maxNodes: 3, onLimit });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));

    alternar(container, 'g');
    expect(onLimit).toHaveBeenCalledWith('g');
    await act(async () => {});
    expect(ids(container)).toEqual(['c', 'g']);
    expect(llamadas.n).toBe(1);
  });

  it('anima el morph: el Grupo sigue fijo en pantalla y lo nuevo entra con fundido', async () => {
    const cuadros: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => cuadros.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = montar({ morphMs: 100 });
    await waitFor(() => expect(ids(container)).toEqual(['c', 'g']));
    const antes = xEnPantalla(container, 'g');

    alternar(container, 'g');
    await waitFor(() => expect(ids(container)).toContain('g.a'));
    const siguiente = () => act(async () => cuadros.shift()!(performance.now()));
    await siguiente(); // inicio
    await siguiente();
    const medio = container.querySelector('[data-id="g.a"] [data-part="nodo"]')!.getAttribute('opacity');
    expect(xEnPantalla(container, 'g')).toBeCloseTo(antes, 5);
    expect(medio).not.toBeNull();
    expect(Number(medio)).toBeLessThan(1);
  });
});
