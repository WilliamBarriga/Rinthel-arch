import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fuenteCanonicaSchema, idDeArista } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';
import { opacidadDeNodo, pulsarEn, pulsarNodo } from './ayudas';
import { TEMA_NEUTRO, metricasDe } from 'tema';

afterEach(cleanup);

const nodo = (id: string, title: string) => ({ id, type: 'servicio', title, description: '', children: [] });

/** a -> b, c -> d: cuatro Nodos en fila. */
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [nodo('a', 'A'), nodo('b', 'B'), nodo('c', 'C'), nodo('d', 'D')],
    edges: [
      { from: { node: 'a' }, to: { node: 'b' } },
      { from: { node: 'c' }, to: { node: 'd' } },
    ],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

/** Adaptador en memoria (sin ELK): Nodos de 100x50 separados 200 en x. */
const enFila: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  const edges: Geometria['edges'] = {};
  for (const e of vista.edges) {
    const desde = nodes[e.from.node]!;
    const hasta = nodes[e.to.node]!;
    edges[idDeArista(e)] = {
      points: [
        { x: desde.x + 100, y: 25 },
        { x: hasta.x, y: 25 },
      ],
    };
  }
  return { nodes, edges, labels: {}, pinsSolapados: [], width: 700, height: 50 };
};

const camaraGrande: Camara = { x: 0, y: 0, width: 800, height: 600 };
const ids = (c: HTMLElement) => [...c.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
const viewBoxDe = (c: HTMLElement) => c.querySelector('[data-diagram]')!.getAttribute('data-camara');
const zonaDe = (c: HTMLElement) => c.firstElementChild!;

/** Evento de raton con `view`, que d3-zoom usa para seguir el arrastre (jsdom no deja pasarlo al constructor). */
function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

function props(extra: Partial<VistaInteractivaProps> = {}): VistaInteractivaProps {
  return { source: fuente, view: 'v', theme: TEMA_NEUTRO, layout: enFila, width: 800, height: 600, ...extra };
}
const montar = (extra: Partial<VistaInteractivaProps> = {}) => render(<VistaInteractiva {...props(extra)} />);

describe('VistaInteractiva', () => {
  it('dibuja los iconos del proveedor `icons`', async () => {
    const conIcono = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', icon: 'logo' }] },
      model: { nodes: [nodo('a', 'A')], edges: [] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    const icons = { resolve: (k: string) => (k === 'logo' ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle r="3"/></svg>' : undefined), keys: () => ['logo'] };
    const { container } = montar({ source: conIcono, camera: camaraGrande, icons });
    await waitFor(() => expect(container.querySelector('[data-icon="logo"]')).not.toBeNull());
  });

  it('dibuja la Vista con la geometria del adaptador de layout', async () => {
    const { container } = montar({ camera: camaraGrande });
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
  });

  it('sin camara, la inicial encuadra toda la Vista en el viewport, centrada', async () => {
    const { container } = montar({ width: 350, height: 100 });

    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
    const [x, y, ancho, alto] = viewBoxDe(container)!.split(' ').map(Number) as [number, number, number, number];
    expect(x).toBeLessThanOrEqual(0);
    expect(x + ancho).toBeGreaterThanOrEqual(700);
    expect(y).toBeLessThanOrEqual(0);
    expect(y + alto).toBeGreaterThanOrEqual(50);
    expect(ancho / alto).toBeCloseTo(3.5, 1);
  });

  it('la camara controlada fija el viewBox', async () => {
    const { container } = montar({ camera: { x: 10, y: 20, width: 400, height: 300 } });
    await waitFor(() => expect(viewBoxDe(container)).toBe('10 20 400 300'));
  });

  it('el zoom con la rueda avisa de una camara mas pequena y no la mueve si es controlada', async () => {
    const onCameraChange = vi.fn();
    const { container } = montar({ camera: camaraGrande, onCameraChange });
    await waitFor(() => expect(ids(container)).toContain('a'));

    fireEvent.wheel(zonaDe(container), { deltaY: -100, clientX: 0, clientY: 0 });

    const nueva = onCameraChange.mock.calls.at(-1)![0] as Camara;
    expect(nueva.width).toBeLessThan(800);
    expect(nueva.height).toBeLessThan(600);
    expect(viewBoxDe(container)).toBe('0 0 800 600');
  });

  it('sin camara controlada, el pan/zoom mueve la propia', async () => {
    const { container } = montar();
    await waitFor(() => expect(ids(container)).toContain('a'));
    fireEvent.wheel(zonaDe(container), { deltaY: -100, clientX: 0, clientY: 0 });
    await waitFor(() => expect(Number(viewBoxDe(container)!.split(' ')[2])).toBeLessThan(800));
  });

  it('arrastrar desplaza la camara', async () => {
    const onCameraChange = vi.fn();
    const { container } = montar({ camera: camaraGrande, onCameraChange });
    await waitFor(() => expect(ids(container)).toContain('a'));

    gesto(zonaDe(container), 'mousedown', 100, 100);
    gesto(window, 'mousemove', 60, 90);
    gesto(window, 'mouseup', 60, 90);

    const nueva = onCameraChange.mock.calls.at(-1)![0] as Camara;
    expect(nueva).toMatchObject({ x: 40, y: 10, width: 800, height: 600 });
  });

  it('seleccionar un Nodo dispara onSelect y lo marca', async () => {
    const onSelect = vi.fn();
    const { container } = montar({ camera: camaraGrande, onSelect });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pulsarNodo(container, 'b');

    expect(onSelect).toHaveBeenCalledWith('b');
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('b'));
  });

  it('seleccionar una Arista dispara onSelect con su id y la marca', async () => {
    const onSelect = vi.fn();
    const { container } = montar({ camera: camaraGrande, onSelect });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pulsarEn(container, 150, 25);

    const id = idDeArista({ from: { node: 'a' }, to: { node: 'b' } });
    expect(onSelect).toHaveBeenCalledWith(id);
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe(id));
  });

  it('seleccionar una fila de Atributo la selecciona a ella y no al Nodo', async () => {
    const conAtributos = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ ...nodo('t', 'T'), attributes: [{ name: 'id', type: 'uuid' }, { name: 'mail', type: 'text' }] }], edges: [] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    const { cabecera, fila } = metricasDe(TEMA_NEUTRO);
    const alto: AdaptadorDeLayout = async () => ({
      nodes: { t: { x: 0, y: 0, width: 200, height: cabecera + 2 * fila } },
      edges: {},
      labels: {},
      pinsSolapados: [],
      width: 200,
      height: cabecera + 2 * fila,
    });
    const onSelect = vi.fn();
    const { container } = montar({ source: conAtributos, layout: alto, camera: { x: 0, y: 0, width: 400, height: 300 }, onSelect });
    await waitFor(() => expect(ids(container)).toContain('t'));

    pulsarEn(container, 50, cabecera + fila * 1.5);

    expect(onSelect).toHaveBeenCalledWith('t#mail');
  });

  it('con mayusculas pulsadas la Seleccion crece y pulsar de nuevo quita', async () => {
    const { container } = montar({ camera: camaraGrande });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pulsarNodo(container, 'a');
    pulsarNodo(container, 'b', { shiftKey: true });
    await waitFor(() => expect([...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'))).toEqual(['a', 'b']));
    pulsarNodo(container, 'a', { shiftKey: true });
    await waitFor(() => expect([...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'))).toEqual(['b']));
  });

  it('la seleccion controlada manda sobre la interna', async () => {
    const { container } = montar({ camera: camaraGrande, selected: 'c' });
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('c'));
    pulsarNodo(container, 'b');
    expect(container.querySelector('[data-selected]')!.getAttribute('data-selected')).toBe('c');
  });

  it('la Seleccion multiple controlada manda y avisa con todos los ids', async () => {
    const onSelectionChange = vi.fn();
    const { container } = montar({ camera: camaraGrande, selection: ['a', 'c'], onSelectionChange });
    const marcados = (): (string | null)[] => [...container.querySelectorAll('[data-selected]')].map((e) => e.getAttribute('data-selected'));
    await waitFor(() => expect(marcados()).toEqual(['a', 'c']));

    pulsarNodo(container, 'b', { shiftKey: true });

    expect(onSelectionChange).toHaveBeenCalledWith(['a', 'c', 'b']);
    expect(marcados()).toEqual(['a', 'c']);
  });

  it('onSelectionChange avisa tambien al quitar y al vaciar la Seleccion', async () => {
    const onSelectionChange = vi.fn();
    const { container } = montar({ camera: camaraGrande, onSelectionChange });
    await waitFor(() => expect(ids(container)).toContain('b'));

    pulsarNodo(container, 'a');
    pulsarNodo(container, 'b', { shiftKey: true });
    pulsarNodo(container, 'a', { shiftKey: true });
    pulsarNodo(container, 'b', { shiftKey: true });

    expect(onSelectionChange.mock.calls.map((c) => c[0])).toEqual([['a'], ['a', 'b'], ['b'], []]);
  });

  it('no dibuja los Nodos ni las Aristas fuera del viewport', async () => {
    const { container, rerender } = montar({ camera: { x: 0, y: 0, width: 350, height: 100 } });
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b']));
    expect(container.querySelectorAll('[data-edge]').length).toBe(1);

    rerender(<VistaInteractiva {...props({ camera: { x: 400, y: 0, width: 350, height: 100 } })} />);
    await waitFor(() => expect(ids(container)).toEqual(['c', 'd']));
  });

  it('un Nodo parcialmente visible se dibuja', async () => {
    const { container } = montar({ camera: { x: 250, y: 0, width: 100, height: 50 } });
    await waitFor(() => expect(ids(container)).toEqual(['b']));
  });

  it('pasa la visibilidad de Pasos a render', async () => {
    const { container } = montar({ camera: camaraGrande, visibility: (id) => (id === 'a' ? 0.5 : 1) });
    await waitFor(() => expect(opacidadDeNodo(container, 'a')).toBe('0.5'));
  });

  it('un fallo del adaptador de layout se avisa por onError', async () => {
    const onError = vi.fn();
    montar({ layout: () => Promise.reject(new Error('elk roto')), onError });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'elk roto' })));
  });

  it('una Vista inexistente es un fallo de uso', () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => montar({ view: 'no-existe' })).toThrow(/no-existe/);
    silencio.mockRestore();
  });

  it('descarta el layout viejo cuando llega despues del nuevo', async () => {
    let resolverViejo!: (g: Geometria) => void;
    let llamadas = 0;
    const adaptador: AdaptadorDeLayout = (vista, tema) =>
      ++llamadas === 1 ? new Promise<Geometria>((r) => (resolverViejo = r)) : enFila(vista, tema);
    const { container, rerender } = montar({ layout: adaptador, camera: camaraGrande });
    rerender(<VistaInteractiva {...props({ layout: adaptador, camera: camaraGrande, theme: { ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '20px' } } })} />);
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
    resolverViejo({ nodes: {}, edges: {}, labels: {}, pinsSolapados: [], width: 1, height: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(container)).toEqual(['a', 'b', 'c', 'd']);
  });
});
