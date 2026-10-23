import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara, VistaInteractivaProps } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const nodo = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children });
const arista = (from: string, to: string) => ({ from: { node: from }, to: { node: to } });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [nodo('a'), nodo('b'), nodo('c'), nodo('g', [nodo('g.x')])],
    edges: [arista('a', 'b'), arista('b', 'c')],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], expanded: ['g'] }],
});
const enFila: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 60, y: 0, width: 50, height: 50 };
  });
  const edges: Geometria['edges'] = {};
  edges['a -> b'] = { points: [{ x: 100, y: 25 }, { x: 120, y: 25 }] };
  edges['b -> c'] = { points: [{ x: 220, y: 25 }, { x: 240, y: 25 }] };
  return { nodes, edges, labels: {}, pinsSolapados: [], width: 600, height: 50 };
};
const camara: Camara = { x: 0, y: 0, width: 800, height: 600 };

async function montar(extra: Partial<VistaInteractivaProps> = {}) {
  const r = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={enFila} width={800} height={600} camera={camara} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="a"]')).not.toBeNull());
  return { ...r, zona: r.container.querySelector<HTMLElement>('.rd-vista')! };
}
const conFoco = (c: HTMLElement) => [...c.querySelectorAll('[data-state="foco"]')].map((e) => e.closest('[data-id]')?.getAttribute('data-id') ?? e.getAttribute('data-selected'));
const atenuados = (c: HTMLElement) => [...c.querySelectorAll('[data-atenuado]')].map((e) => e.getAttribute('data-id') ?? e.getAttribute('data-edge'));
const enRuta = (c: HTMLElement) => [...c.querySelectorAll('.rd-caja [data-state="en-ruta"]')].map((e) => e.closest('[data-id]')!.getAttribute('data-id'));
const tecla = (zona: HTMLElement, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(zona, { key, ...init });

describe('teclado', () => {
  it('el lienzo entra en el orden de tabulacion y al recibir el foco marca el primer Nodo', async () => {
    const { zona, container } = await montar();

    expect(zona.getAttribute('tabindex')).toBe('0');
    expect(conFoco(container)).toEqual([]);
    fireEvent.focus(zona);
    expect(conFoco(container)).toEqual(['a']);
  });

  it('Tab recorre Nodos y Grupos en orden del Modelo y Shift+Tab vuelve', async () => {
    const { zona, container } = await montar();
    fireEvent.focus(zona);
    tecla(zona, 'Tab');
    tecla(zona, 'Tab');
    expect(conFoco(container)).toEqual(['c']);
    tecla(zona, 'Tab');
    tecla(zona, 'Tab');
    expect(conFoco(container)).toEqual(['g.x']);
    tecla(zona, 'Tab', { shiftKey: true });
    expect(conFoco(container)).toEqual(['g']);
  });

  it('las flechas saltan por Aristas al vecino', async () => {
    const { zona, container } = await montar();
    fireEvent.focus(zona);
    tecla(zona, 'ArrowRight');
    expect(conFoco(container)).toEqual(['b']);
    tecla(zona, 'ArrowDown');
    expect(conFoco(container)).toEqual(['c']);
    tecla(zona, 'ArrowLeft');
    tecla(zona, 'ArrowUp');
    expect(conFoco(container)).toEqual(['a']);
  });

  it('Enter y Espacio colapsan o abren el Grupo con foco', async () => {
    const { zona, container } = await montar();
    fireEvent.focus(zona);
    for (let i = 0; i < 3; i++) tecla(zona, 'Tab');
    expect(conFoco(container)).toEqual(['g']);
    expect(container.querySelector('[data-id="g.x"]')).not.toBeNull();
    tecla(zona, 'Enter');
    await waitFor(() => expect(container.querySelector('[data-id="g.x"]')).toBeNull());
    tecla(zona, ' ');
    await waitFor(() => expect(container.querySelector('[data-id="g.x"]')).not.toBeNull());
  });

  it('perder el foco quita el anillo', async () => {
    const { zona, container } = await montar();
    fireEvent.focus(zona);
    fireEvent.blur(zona);
    expect(conFoco(container)).toEqual([]);
  });
});

describe('ruta', () => {
  it('resaltar una ruta pone en-ruta lo que la compone y atenua el resto', async () => {
    const { container } = await montar({ route: ['a', 'b', 'c'] });

    expect(enRuta(container).sort()).toEqual(['a', 'b', 'c']);
    expect(atenuados(container).sort()).toEqual(['g', 'g.x']);
    expect(container.querySelectorAll('path[data-state="en-ruta"]')).toHaveLength(2);
  });

  it('dos Nodos seleccionados resaltan la ruta mas corta entre ellos', async () => {
    const { container } = await montar({ selection: ['a', 'c'] });

    expect(enRuta(container).sort()).toEqual(['a', 'b', 'c']);
    expect(atenuados(container).sort()).toEqual(['g', 'g.x']);
  });

  it('sin ruta ni dos Nodos seleccionados no se atenua nada', async () => {
    const { container } = await montar({ selection: ['a'] });

    expect(atenuados(container)).toEqual([]);
  });
});
