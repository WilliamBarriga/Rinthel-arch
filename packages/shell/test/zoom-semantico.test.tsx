import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, nivelDeDetalle } from 'shell';
import type { AdaptadorDeLayout, Camara } from 'shell';

afterEach(cleanup);

const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'tabla', icon: 'database' }, { name: 'grupo' }] },
  model: {
    nodes: [
      {
        id: 'g',
        type: 'grupo',
        title: 'Grupo completo',
        description: '',
        children: [
          { id: 'g.u', type: 'tabla', title: 'Usuarios del sistema', description: '', children: [], attributes: [{ name: 'id', type: 'uuid' }] },
        ],
      },
    ],
    edges: [],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides: [{ node: 'g.u', label: 'Usr' }] }],
});

const fijo: AdaptadorDeLayout = async (vista: VistaResuelta) => {
  const nodes: Geometria['nodes'] = { g: { x: 0, y: 0, width: 400, height: 200 } };
  for (const hijo of vista.nodes[0]!.children) nodes[hijo.id] = { x: 20, y: 40, width: 200, height: 100 };
  return { nodes, edges: {}, pinsSolapados: [], width: 400, height: 200 };
};

const conAncho = (width: number): Camara => ({ x: 0, y: 0, width, height: (width * 600) / 800 });
const montar = (camera: Camara) =>
  render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={fijo} width={800} height={600} camera={camera} />);

describe('nivelDeDetalle', () => {
  it('elige el nivel por escala', () => {
    expect(nivelDeDetalle(0.1)).toBe('etiqueta');
    expect(nivelDeDetalle(0.5)).toBe('titulo');
    expect(nivelDeDetalle(1)).toBe('completo');
    expect(nivelDeDetalle(16)).toBe('completo');
  });

  it('respeta umbrales propios y es inclusivo en el limite', () => {
    const umbrales = { titulo: 1, completo: 2 };
    expect(nivelDeDetalle(0.99, umbrales)).toBe('etiqueta');
    expect(nivelDeDetalle(1, umbrales)).toBe('titulo');
    expect(nivelDeDetalle(2, umbrales)).toBe('completo');
  });
});

describe('VistaInteractiva: zoom semantico', () => {
  it('a escala 1 muestra titulo y Atributos', async () => {
    const { container } = montar(conAncho(800));
    await waitFor(() => expect(container.textContent).toContain('id: uuid'));
    expect(container.textContent).toContain('Usuarios del sistema');
  });

  it('a escala media muestra el titulo sin Atributos', async () => {
    const { container } = montar(conAncho(1600));
    await waitFor(() => expect(container.textContent).toContain('Usuarios del sistema'));
    expect(container.textContent).not.toContain('id: uuid');
  });

  it('a escala baja muestra la etiqueta corta', async () => {
    const { container } = montar(conAncho(4000));
    await waitFor(() => expect(container.textContent).toContain('Usr'));
    expect(container.textContent).not.toContain('Usuarios del sistema');
    expect(container.textContent).not.toContain('id: uuid');
  });

  it('la geometria y la estructura son identicas entre niveles; el zoom no colapsa', async () => {
    const forma = async (ancho: number) => {
      const { container, unmount } = montar(conAncho(ancho));
      await waitFor(() => expect(container.querySelector('[data-id="g.u"]')).not.toBeNull());
      const datos = {
        ids: [...container.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')),
        cajas: [...container.querySelectorAll('[data-id]')].map((e) => [e.getAttribute('transform'), e.querySelector('rect')!.getAttribute('width'), e.querySelector('rect')!.getAttribute('height')]),
        toggles: container.querySelectorAll('[data-toggle]').length,
      };
      unmount();
      return datos;
    };
    const completo = await forma(800);
    expect(await forma(1600)).toEqual(completo);
    expect(await forma(4000)).toEqual(completo);
    expect(completo.ids).toEqual(['g', 'g.u']);
  });
});
