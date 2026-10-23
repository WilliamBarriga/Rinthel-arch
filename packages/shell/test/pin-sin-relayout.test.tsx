import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { FuenteCanonica } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, Camara } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import { posicionDe } from './ayudas';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const fuente = (overrides: unknown[]): FuenteCanonica =>
  fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [nodo('a'), nodo('b')], edges: [] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], overrides }],
  });
const conPin = (x: number, y: number) => fuente([{ node: 'b', pin: { x, y } }]);

const camara: Camara = { x: 0, y: 0, width: 800, height: 600 };

describe('mover un Pin en el shell', () => {
  it('no vuelve a llamar al adaptador de layout y muestra el Pin nuevo', async () => {
    const layout = vi.fn<AdaptadorDeLayout>(async (vista) => ({
      nodes: Object.fromEntries(vista.nodes.map((n, i) => [n.id, { x: i * 200, y: 0, width: 100, height: 50 }])),
      edges: {},
      labels: {},
      pinsSolapados: [],
      width: 300,
      height: 50,
    } satisfies Geometria));
    const props = (source: FuenteCanonica) => ({ source, view: 'v', theme: TEMA_NEUTRO, layout, width: 800, height: 600, camera: camara });
    const { container, rerender } = render(<VistaInteractiva {...props(fuente([]))} />);
    await waitFor(() => expect(posicionDe(container, 'b')).toEqual([200, 0]));

    rerender(<VistaInteractiva {...props(conPin(500, 300))} />);
    await waitFor(() => expect(posicionDe(container, 'b')).toEqual([450, 275])); // el Pin ancla el centro: esquina = Pin - mitad de la caja (100x50)
    rerender(<VistaInteractiva {...props(conPin(510, 310))} />);
    await waitFor(() => expect(posicionDe(container, 'b')).toEqual([460, 285]));

    expect(layout).toHaveBeenCalledTimes(1);
  });
});
