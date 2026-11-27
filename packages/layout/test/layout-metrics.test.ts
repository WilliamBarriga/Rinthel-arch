import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, resolveView } from 'canonical';
import type { Theme, GraphView, ResolvedView } from 'canonical';
import { layoutKey, layoutWithMetrics, layoutView as layoutViewRaw } from 'layout';
import { NEUTRAL_THEME, textKey, metricsOf, metricsTable } from 'theme';

/** `layoutView` of a graph View (architecture or flow): these tests look at boxes and Edge routes. */
const layoutView = async (...args: Parameters<typeof layoutViewRaw>) => {
  const geometry = await layoutViewRaw(...args);
  if (geometry.kind !== 'grafo') throw new Error('expected a graph Geometry');
  return geometry;
};


const capas = [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
  { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'blue' } } },
];
const withNodeTypes = (types: Record<string, unknown[]>, baseLayers: unknown[] = capas) =>
  ({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: baseLayers, tipos: types } }) as Theme;
const large = withNodeTypes({ db: [{ nombre: 'forma', primitiva: 'circle', props: {} }] });

const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, title: id, description: '', children: [], ...extra });

function viewOf(nodes: unknown[], edges: unknown[]): GraphView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }, { name: 'db' }] },
    model: { nodes, edges },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  return resolveView(source, 'v') as GraphView;
}
const twoNodeTypes = (): ResolvedView => viewOf([node('api', 'servicio'), node('datos', 'db')], [{ from: { node: 'api' }, to: { node: 'datos' }, label: 'lee' }]);

describe('Metrics per Node kind and relayout by structure key', () => {
  it('different boxes per Node kind in the same View', async () => {
    const g = await layoutView(twoNodeTypes(), large);

    expect(g.nodes['datos']!.width).toBe(g.nodes['datos']!.height);
    expect(g.nodes['api']!.width).not.toBe(g.nodes['api']!.height);
  });

  it('a Theme with identical Metrics reuses the layout key even if the paint changes', () => {
    const otherPaint = withNodeTypes({ db: [{ nombre: 'forma', primitiva: 'circle', props: {} }] }, [
      capas[0],
      { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'red' } } },
      { nombre: 'aura', primitiva: { tipo: 'border', props: { color: 'red', width: 4 } } },
    ]);

    expect(layoutKey(twoNodeTypes(), otherPaint)).toBe(layoutKey(twoNodeTypes(), large));
    expect(layoutKey(twoNodeTypes(), large)).not.toBe(layoutKey(twoNodeTypes(), withNodeTypes({})));
  });

  it('the Edge to node#attribute ends at the drawn row even if the Node kind changes the box', async () => {
    const v = viewOf(
      [node('api', 'servicio'), node('t', 'db', { attributes: [{ name: 'id', type: 'uuid' }] })],
      [{ from: { node: 'api' }, to: { node: 't', attribute: 'id' } }],
    );
    const g = await layoutView(v, large);
    const m = metricsOf(NEUTRAL_THEME, 'architecture');
    const route = g.edges[edgeId(v.edges[0]!)]!.points;

    const box = g.nodes['t']!;
    // The `db` kind is a circle: the content (header + one row) is centered in its square box.
    const top = (box.height - (m.cabecera + m.fila)) / 2;

    expect(route[route.length - 1]!.y).toBe(box.y + top + m.cabecera + m.fila / 2);
  });
});

describe('text measurement in the layout', () => {
  const theme = NEUTRAL_THEME as unknown as Theme;
  const one = (): ResolvedView => viewOf([node('api', 'servicio')], []);
  const measuresOf = (width: number, hash = 'aaaa') => {
    const m = metricsTable(theme, 'architecture').base;
    return { nivel: 'medido' as const, fuentes: { sans: hash }, anchos: { [textKey(NEUTRAL_THEME.fonts.body, m.fontSize, 'api')]: width } };
  };

  it('with measures the box comes from the measured width; without them, from the estimate', async () => {
    const estimated = await layoutView(one(), theme);
    const measured = await layoutView(one(), theme, { measures: measuresOf(400) });

    expect(measured.nodes['api']!.width).toBe(400 + metricsTable(theme, 'architecture').base.paddingHorizontal);
    expect(estimated.nodes['api']!.width).toBe(120);
  });

  it('the key changes with the origin of the measures and with the font hash, and with nothing else of the paint', () => {
    const key = (m?: ReturnType<typeof measuresOf>) => layoutKey(one(), theme, metricsTable(theme, 'architecture', m));
    const repainted = { ...theme, palette: { ...theme.palette, blue: '#ff0000' } } as Theme;

    expect(key(measuresOf(400))).not.toBe(key());
    expect(key(measuresOf(400, 'bbbb'))).not.toBe(key(measuresOf(400)));
    expect(layoutKey(one(), repainted, metricsTable(repainted, 'architecture'))).toBe(key());
  });
});

describe('sequence layout requires sequence Metrics', () => {
  const sequence = (): ResolvedView => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [node('a', 'servicio'), node('b', 'servicio')],
        interactions: [{ id: 'i', title: 'I', items: [{ type: 'message', from: 'a', to: 'b', label: 'x', kind: 'sync' }] }],
      },
      views: [{ id: 'v', type: 'sequence', interaction: 'i', include: [], exclude: [] }],
    });
    return resolveView(source, 'v')!;
  };

  it('an architecture View table throws instead of falling back to defaults', async () => {
    await expect(layoutWithMetrics(sequence(), metricsTable(NEUTRAL_THEME, 'architecture'))).rejects.toThrow(/sequence part/);
  });

  it('the sequence table places it', async () => {
    expect((await layoutWithMetrics(sequence(), metricsTable(NEUTRAL_THEME, 'sequence'))).kind).toBe('secuencia');
  });
});
