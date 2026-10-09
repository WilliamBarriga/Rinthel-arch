import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, idDeArista } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, VistaInteractivaProps } from 'shell';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });

const fuente = (steps: unknown[]) =>
  fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [nodo('a'), nodo('b'), nodo('c')],
      edges: [
        { from: { node: 'a' }, to: { node: 'b' } },
        { from: { node: 'b' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], steps }],
  });

const pasos = [
  { title: 'Entrada', show: [{ selector: 'a' }, { selector: 'b' }] },
  { title: 'Salida', show: [{ selector: 'c' }] },
];

const enFila: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = {};
  vista.nodes.forEach((n, i) => {
    nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
  });
  const edges: Geometria['edges'] = {};
  for (const e of vista.edges) {
    const d = nodes[e.from.node]!;
    const h = nodes[e.to.node]!;
    edges[idDeArista(e)] = { points: [{ x: d.x + 100, y: 25 }, { x: h.x, y: 25 }] };
  }
  return { nodes, edges, pinsSolapados: [], width: 500, height: 50 };
};

const montar = (steps: unknown[], extra: Partial<VistaInteractivaProps> = {}) =>
  render(
    <VistaInteractiva source={fuente(steps)} view="v" theme={TEMA_NEUTRO} layout={enFila} width={800} height={600} camera={{ x: 0, y: 0, width: 800, height: 600 }} {...extra} />,
  );

const opacidad = (c: HTMLElement, id: string): number => {
  const el = c.querySelector(`svg [data-id="${id}"], svg [data-edge="${id}"]`);
  const v = (el?.querySelector('[data-part]') ?? el)?.getAttribute('opacity');
  return v === null || v === undefined ? 1 : Number(v);
};
const dibujado = (c: HTMLElement) => waitFor(() => expect(c.querySelector('svg [data-id="a"]')).not.toBeNull());
const sinVisibilidad = (c: HTMLElement) =>
  c.querySelector('svg')!.innerHTML.replace(/ opacity="[^"]*"/g, '').replace(/ pointer-events="[^"]*"/g, '');

describe('Pasos anterior y siguiente', () => {
  it('sin steps no hay controles ni se oculta nada', async () => {
    const { container } = montar([]);
    await dibujado(container);
    expect(screen.queryByRole('button', { name: 'Paso siguiente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paso anterior' })).toBeNull();
    expect(opacidad(container, 'c')).toBe(1);
  });

  it('siguiente revela Nodos y Aristas acumulativamente', async () => {
    const { container } = montar(pasos);
    await dibujado(container);
    expect(opacidad(container, 'a')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(opacidad(container, 'a')).toBe(1);
    expect(opacidad(container, 'b')).toBe(1);
    expect(opacidad(container, 'c')).toBe(0);
    expect(opacidad(container, 'a -> b')).toBe(1);
    expect(opacidad(container, 'b -> c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(opacidad(container, 'a')).toBe(1);
    expect(opacidad(container, 'c')).toBe(1);
    expect(opacidad(container, 'b -> c')).toBe(1);
  });

  it('anterior oculta lo del ultimo Paso; los botones se deshabilitan en los extremos', async () => {
    const { container } = montar(pasos, { defaultStep: 2 });
    await dibujado(container);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Paso siguiente' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Paso anterior' }));
    expect(opacidad(container, 'c')).toBe(0);
    expect(opacidad(container, 'a')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Paso anterior' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Paso anterior' }).disabled).toBe(true);
  });

  it('la geometria no cambia entre Pasos', async () => {
    const { container } = montar(pasos);
    await dibujado(container);
    const antes = sinVisibilidad(container);
    fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(sinVisibilidad(container)).toBe(antes);
  });

  it('el Paso controlado por props avisa con onStepChange y no se mueve solo', async () => {
    const onStepChange = vi.fn();
    const { container } = montar(pasos, { step: 1, onStepChange });
    await dibujado(container);
    expect(opacidad(container, 'c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(onStepChange).toHaveBeenCalledWith(2);
    expect(opacidad(container, 'c')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Paso anterior' }));
    expect(onStepChange).toHaveBeenLastCalledWith(0);
  });

  it('muestra la posicion y el titulo del Paso actual', async () => {
    const { container } = montar(pasos, { step: 1 });
    await dibujado(container);
    expect(screen.getByText('Paso 1 de 2: Entrada')).toBeTruthy();
  });
});
