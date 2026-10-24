import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id, description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: { nodes: [nodo('a'), nodo('b')], edges: [] },
  views: [
    { id: 'uno', type: 'architecture', include: ['**'], exclude: [] },
    { id: 'dos', type: 'architecture', include: ['a'], exclude: [] },
  ],
});

/** Adaptador cuyo resultado se libera a mano, para observar el estado mientras ELK trabaja. */
function adaptadorManual(): { layout: AdaptadorDeLayout; liberar: () => void } {
  const pendientes: Array<() => void> = [];
  const layout: AdaptadorDeLayout = (vista: VistaResuelta) =>
    new Promise<Geometria>((resolver) => {
      const nodes: Geometria['nodes'] = {};
      vista.nodes.forEach((n, i) => {
        nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
      });
      pendientes.push(() => resolver({ nodes, edges: {}, labels: {}, pinsSolapados: [], width: 300, height: 50 }));
    });
  return { layout, liberar: () => act(() => pendientes.splice(0).forEach((f) => f())) as unknown as void };
}

const zona = (c: HTMLElement) => c.querySelector('.rd-vista')!;

describe('senal de layout del contenedor de la Vista', () => {
  it('marca calculando mientras el layout trabaja y listo cuando llega, con la Vista activa', async () => {
    const { layout, liberar } = adaptadorManual();
    const { container } = render(<VistaInteractiva source={fuente} view="uno" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} />);
    expect(zona(container).getAttribute('data-layout')).toBe('calculando');
    expect(zona(container).getAttribute('data-vista')).toBe('uno');
    liberar();
    await waitFor(() => expect(zona(container).getAttribute('data-layout')).toBe('listo'));
    expect(zona(container).getAttribute('data-vista')).toBe('uno');
  });

  it('vuelve a calculando al cambiar de Vista hasta que llega su layout', async () => {
    const { layout, liberar } = adaptadorManual();
    const { container, rerender } = render(<VistaInteractiva source={fuente} view="uno" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} />);
    liberar();
    await waitFor(() => expect(zona(container).getAttribute('data-layout')).toBe('listo'));
    rerender(<VistaInteractiva source={fuente} view="dos" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} />);
    expect(zona(container).getAttribute('data-layout')).toBe('calculando');
    expect(zona(container).getAttribute('data-vista')).toBe('dos');
    liberar();
    await waitFor(() => expect(zona(container).getAttribute('data-layout')).toBe('listo'));
  });
});
