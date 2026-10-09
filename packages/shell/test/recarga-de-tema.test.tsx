import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema } from 'canonico';
import type { Tema, VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, SuscripcionDeTema } from 'shell';

afterEach(cleanup);

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }] },
  model: { nodes: [nodo('a'), nodo('b')], edges: [] },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});

/** Layout fake que cuenta llamadas y recuerda la Vista y el Tema que recibio. */
function layoutContador() {
  const llamadas: { vista: VistaResuelta; tema: Tema }[] = [];
  const layout: AdaptadorDeLayout = async (vista, tema) => {
    llamadas.push({ vista, tema });
    const nodes: Geometria['nodes'] = {};
    vista.nodes.forEach((n, i) => {
      nodes[n.id] = { x: i * 200, y: 0, width: 100, height: 50 };
    });
    return { nodes, edges: {}, labels: {}, pinsSolapados: [], width: 300, height: 50 };
  };
  return { llamadas, layout };
}

/** Puerto en memoria: el consumidor llama `guardar` cuando el archivo de tema cambia. */
function fakeDeTema() {
  const oyentes = new Set<(t: Tema) => void>();
  const suscribir: SuscripcionDeTema = (alCambiar) => {
    oyentes.add(alCambiar);
    return () => oyentes.delete(alCambiar);
  };
  return { suscribir, guardar: (t: Tema) => act(() => oyentes.forEach((o) => o(t))), oyentes };
}

const montar = (layout: AdaptadorDeLayout, themeUpdates: SuscripcionDeTema) =>
  render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} themeUpdates={themeUpdates} />);

describe('recarga de tema al guardar', () => {
  it('un cambio de paleta recolorea sin relayout ni recomputar la Vista', async () => {
    const { llamadas, layout } = layoutContador();
    const tema = fakeDeTema();
    const { container } = montar(layout, tema.suscribir);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const antes = container.innerHTML;
    tema.guardar({ ...TEMA_NEUTRO, palette: { ...TEMA_NEUTRO.palette, blue: '#ff0000' } });
    await waitFor(() => expect(container.innerHTML).not.toBe(antes));
    expect(container.innerHTML).toContain('#ff0000');
    expect(llamadas).toHaveLength(1);
  });

  it('un cambio de fuente relayouta con el Tema nuevo y la misma Vista', async () => {
    const { llamadas, layout } = layoutContador();
    const tema = fakeDeTema();
    const { container } = montar(layout, tema.suscribir);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    const nuevo = { ...TEMA_NEUTRO, fonts: { ...TEMA_NEUTRO.fonts, body: 'Courier Mono' } };
    tema.guardar(nuevo);
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas[1]!.tema).toBe(nuevo);
    expect(llamadas[1]!.vista).toBe(llamadas[0]!.vista);
  });

  it('un cambio de tamano de texto relayouta', async () => {
    const { llamadas, layout } = layoutContador();
    const tema = fakeDeTema();
    const { container } = montar(layout, tema.suscribir);
    await waitFor(() => expect(container.querySelector('[data-id="a"]')).not.toBeNull());
    tema.guardar({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '22px' } });
    await waitFor(() => expect(llamadas).toHaveLength(2));
  });

  it('se da de baja de la suscripcion al desmontar', () => {
    const { layout } = layoutContador();
    const tema = fakeDeTema();
    const { unmount } = montar(layout, tema.suscribir);
    expect(tema.oyentes.size).toBe(1);
    unmount();
    expect(tema.oyentes.size).toBe(0);
  });
});
