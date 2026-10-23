import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, VistaInteractivaProps } from 'shell';
import { pulsarNodo } from './ayudas';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

// Vista 'a' enlaza el Nodo x a 'b'; 'b' enlaza y a 'a' (ciclo) y z a 'c'.
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('x'), nodo('y'), nodo('z')], edges: [] },
  views: [
    { id: 'a', type: 'architecture', include: ['x'], exclude: [], links: [{ node: 'x', view: 'b' }] },
    {
      id: 'b',
      type: 'architecture',
      include: ['y', 'z'],
      exclude: [],
      links: [
        { node: 'y', view: 'a' },
        { node: 'z', view: 'c' },
      ],
    },
    { id: 'c', type: 'architecture', include: ['z'], exclude: [] },
  ],
});

const enFila: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  return { nodes, edges: {}, labels: {}, pinsSolapados: [], width: 500, height: 50 };
};

const montar = (extra: Partial<VistaInteractivaProps> = {}) =>
  render(
    <VistaInteractiva source={fuente} theme={TEMA_NEUTRO} layout={enFila} width={800} height={600} camera={{ x: 0, y: 0, width: 800, height: 600 }} {...extra} />,
  );

const dibujado = (c: HTMLElement, id: string) => waitFor(() => expect(c.querySelector(`svg [data-id="${id}"]`)).not.toBeNull());
const pulsar = (c: HTMLElement, id: string) => pulsarNodo(c, id);
const migas = () => Array.from(document.querySelectorAll('[data-breadcrumbs] [data-crumb]')).map((e) => e.getAttribute('data-crumb'));

describe('link, breadcrumbs y atras', () => {
  it('un link cambia la Vista y agrega un breadcrumb', async () => {
    const { container } = montar({ defaultView: 'a' });
    await dibujado(container, 'x');
    expect(migas()).toEqual(['a']);
    pulsar(container, 'x');
    await dibujado(container, 'y');
    expect(container.querySelector('svg [data-id="x"]')).toBeNull();
    expect(migas()).toEqual(['a', 'b']);
  });

  it('atras y clic en breadcrumb restauran la Vista', async () => {
    const { container } = montar({ defaultView: 'a' });
    await dibujado(container, 'x');
    pulsar(container, 'x');
    await dibujado(container, 'y');
    pulsar(container, 'z');
    await waitFor(() => expect(container.querySelector('svg [data-id="y"]')).toBeNull());
    await dibujado(container, 'z');
    expect(migas()).toEqual(['a', 'b', 'c']);

    fireEvent.click(screen.getByRole('button', { name: 'Atras' }));
    await dibujado(container, 'y');
    expect(migas()).toEqual(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    await dibujado(container, 'x');
    expect(migas()).toEqual(['a']);
    expect((screen.getByRole('button', { name: 'Atras' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('un ciclo entre Vistas no rompe la navegacion', async () => {
    const { container } = montar({ defaultView: 'a' });
    await dibujado(container, 'x');
    pulsar(container, 'x');
    await dibujado(container, 'y');
    pulsar(container, 'y');
    await dibujado(container, 'x');
    expect(migas()).toEqual(['a', 'b', 'a']);
    fireEvent.click(screen.getByRole('button', { name: 'Atras' }));
    await dibujado(container, 'y');
    expect(migas()).toEqual(['a', 'b']);
  });

  it('controlada: avisa con onViewChange y onPathChange y no cambia sola', async () => {
    const onViewChange = vi.fn();
    const onPathChange = vi.fn();
    const { container } = montar({ view: 'a', path: ['a'], onViewChange, onPathChange });
    await dibujado(container, 'x');
    pulsar(container, 'x');
    expect(onViewChange).toHaveBeenCalledWith('b');
    expect(onPathChange).toHaveBeenCalledWith(['a', 'b']);
    expect(container.querySelector('svg [data-id="x"]')).not.toBeNull();
    expect(migas()).toEqual(['a']);
  });

  it('controlada: la ruta y la Vista que llegan por props se muestran', async () => {
    const onPathChange = vi.fn();
    const { container } = montar({ view: 'c', path: ['a', 'b', 'c'], onPathChange });
    await dibujado(container, 'z');
    expect(migas()).toEqual(['a', 'b', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(onPathChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('solo view (sin path): la ruta se completa con la Vista activa', async () => {
    const { container } = montar({ view: 'b' });
    await dibujado(container, 'y');
    expect(migas()).toEqual(['b']);
  });
});
