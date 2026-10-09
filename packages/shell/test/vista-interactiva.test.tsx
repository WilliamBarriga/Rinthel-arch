import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, idDeArista } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';

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
  return { nodes, edges, pinsSolapados: [], width: 700, height: 50 };
};

const camaraGrande: Camara = { x: 0, y: 0, width: 800, height: 600 };
const ids = (c: HTMLElement) => [...c.querySelectorAll('svg [data-id]')].map((e) => e.getAttribute('data-id'));
const viewBoxDe = (c: HTMLElement) => c.querySelector('svg[viewBox]')!.getAttribute('viewBox');
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
  it('dibuja la Vista con la geometria del adaptador de layout', async () => {
    const { container } = montar({ camera: camaraGrande });
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
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

    fireEvent.click(container.querySelector('[data-id="b"] [data-part="nodo"]')!);

    expect(onSelect).toHaveBeenCalledWith('b');
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('b'));
  });

  it('la seleccion controlada manda sobre la interna', async () => {
    const { container } = montar({ camera: camaraGrande, selected: 'c' });
    await waitFor(() => expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('c'));
    fireEvent.click(container.querySelector('[data-id="b"] [data-part="nodo"]')!);
    expect(container.querySelector('[data-selected]')!.getAttribute('data-selected')).toBe('c');
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
    await waitFor(() => expect(container.querySelector('[data-id="a"] [data-part="nodo"]')?.getAttribute('opacity')).toBe('0.5'));
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
    rerender(<VistaInteractiva {...props({ layout: adaptador, camera: camaraGrande, theme: { ...TEMA_NEUTRO, name: 'otro' } })} />);
    await waitFor(() => expect(ids(container)).toEqual(['a', 'b', 'c', 'd']));
    resolverViejo({ nodes: {}, edges: {}, pinsSolapados: [], width: 1, height: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(container)).toEqual(['a', 'b', 'c', 'd']);
  });
});
