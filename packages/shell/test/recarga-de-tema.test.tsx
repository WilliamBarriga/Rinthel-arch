import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';
import type { Geometry, Theme, ResolvedView } from 'canonical';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const fuente = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
  model: { nodes: [nodo('a'), nodo('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

/** Layout fake que cuenta llamadas y recuerda la Vista y el Tema que recibio. */
function layoutContador() {
  const llamadas: { vista: ResolvedView; tema: Theme }[] = [];
  const layout: AdaptadorDeLayout = async (vista, tema) => {
    llamadas.push({ vista, tema });
    const nodes: Geometry['nodes'] = {};
    vista.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, kind: 'grafo', pinsSolapados: [], width: 300, height: 50 };
  };
  return { llamadas, layout };
}

const montar = (layout: AdaptadorDeLayout) =>
  render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} />);
const conTema = (layout: AdaptadorDeLayout, theme: Theme) => (
  <VistaInteractiva source={fuente} view="v" theme={theme} layout={layout} width={800} height={600} />
);

describe('cambio de tema desde el padre', () => {
  it('un cambio de paleta recolorea sin relayout ni recomputar la Vista', async () => {
    const { llamadas, layout } = layoutContador();
    const { container, rerender } = montar(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const antes = container.innerHTML;
    rerender(conTema(layout, { ...TEMA_NEUTRO, palette: { ...TEMA_NEUTRO.palette, blue: '#ff0000' } }));
    await waitFor(() => expect(container.innerHTML).not.toBe(antes));
    expect(container.innerHTML).toContain('#ff0000');
    expect(llamadas).toHaveLength(1);
  });

  it('un cambio de fuente relayouta con el Tema nuevo y la misma Vista', async () => {
    const { llamadas, layout } = layoutContador();
    const { container, rerender } = montar(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const nuevo = { ...TEMA_NEUTRO, fonts: { ...TEMA_NEUTRO.fonts, body: 'Courier Mono' } };
    rerender(conTema(layout, nuevo));
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas[1]!.tema).toBe(nuevo);
    expect(llamadas[1]!.vista).toBe(llamadas[0]!.vista);
  });

  it('un cambio de tamano de texto relayouta', async () => {
    const { llamadas, layout } = layoutContador();
    const { container, rerender } = montar(layout);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    rerender(conTema(layout, { ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '22px' } }));
    await waitFor(() => expect(llamadas).toHaveLength(2));
  });
});
