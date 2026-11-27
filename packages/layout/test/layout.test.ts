import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, resolveView } from 'canonical';
import type { Attribute, NodeBox, Geometry, Theme, GraphView, ResolvedView } from 'canonical';
import { applyPinsToGeometry, structureKey, layoutKey, layoutView as layoutDeVista } from 'layout';
import { NEUTRAL_THEME, metricsOf, metricsTable } from 'theme';

/** `layoutView` of a graph View (architecture or flow): these tests look at boxes and Edge routes. */
const layoutView = async (...args: Parameters<typeof layoutDeVista>) => {
  const geometry = await layoutDeVista(...args);
  if (geometry.kind !== 'grafo') throw new Error('expected a graph Geometry');
  return geometry;
};


const node = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop(),
  description: '',
  children,
});

/** a { a1 a2 a3 }, b { b1 b2 }, c; Edges between Groups and to a child of another Group. */
function view(viewExtra: Record<string, unknown> = {}, state = {}): GraphView {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [
        node('a', [node('a.a1'), node('a.a2'), node('a.a3')]),
        node('b', [node('b.b1'), node('b.b2')]),
        node('c'),
      ],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'a.a2' } },
        { from: { node: 'a.a2' }, to: { node: 'b.b1' } },
        { from: { node: 'b.b2' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...viewExtra }],
  });
  const resolved = resolveView(source, 'v', state);
  if (resolved === undefined || resolved.type === 'sequence') throw new Error('View missing or of sequence type');
  return resolved;
}

const withTheme = (changes: Partial<Theme>): Theme => ({ ...NEUTRAL_THEME, ...changes });

describe('layoutView', () => {
  describe('Edge labels', () => {
    const withLabel = (label: string | undefined, viewExtra: Record<string, unknown> = {}): ResolvedView => {
      const base = view(viewExtra);
      return { ...base, edges: base.edges.map((edge) => (edge.to.node === 'c' ? { ...edge, ...(label !== undefined && { label }) } : edge)) };
    };
    const absolute = (g: Geometry, id: string): NodeBox => {
      const parts = id.split('.');
      return parts.slice(0, -1).reduce((box, _, i) => {
        const parent = g.nodes[parts.slice(0, i + 1).join('.')]!;
        return { ...box, x: box.x + parent.x, y: box.y + parent.y };
      }, g.nodes[id]!);
    };

    it('reserves a box for each label, without overlapping any Node', async () => {
      const geometry = await layoutView(withLabel('publica eventos al bus'), NEUTRAL_THEME);
      const box = geometry.labels['b.b2 -> c'];

      expect(box).toBeDefined();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
      expect(Object.keys(geometry.labels)).toEqual(['b.b2 -> c']);
      for (const id of Object.keys(geometry.nodes)) {
        const n = absolute(geometry, id);
        const outside = box!.x + box!.width <= n.x || n.x + n.width <= box!.x || box!.y + box!.height <= n.y || n.y + n.height <= box!.y;
        expect(outside, `la etiqueta pisa ${id}`).toBe(true);
      }
    });

    it('without labels there are no label boxes and the layout does not change', async () => {
      const without = await layoutView(withLabel(undefined), NEUTRAL_THEME);

      expect(without.labels).toEqual({});
      expect(without).toEqual(await layoutView(view(), NEUTRAL_THEME));
    });

    it('the label is part of the layout key', () => {
      expect(layoutKey(withLabel('x'), NEUTRAL_THEME)).not.toBe(layoutKey(withLabel(undefined), NEUTRAL_THEME));
    });

    it('a longer label takes a wider box', async () => {
      const short = (await layoutView(withLabel('ab'), NEUTRAL_THEME)).labels['b.b2 -> c']!;
      const long = (await layoutView(withLabel('una etiqueta bastante larga'), NEUTRAL_THEME)).labels['b.b2 -> c']!;

      expect(long.width).toBeGreaterThan(short.width);
    });
  });

  it('each visible Node has a positive size and a position relative to its Group', async () => {
    const geometry = await layoutView(view(), NEUTRAL_THEME);

    expect(Object.keys(geometry.nodes).sort()).toEqual(['a', 'a.a1', 'a.a2', 'a.a3', 'b', 'b.b1', 'b.b2', 'c']);
    for (const box of Object.values(geometry.nodes)) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  it('children stay inside their Group', async () => {
    const { nodes } = await layoutView(view(), NEUTRAL_THEME);

    for (const [group, childNodes] of [['a', ['a.a1', 'a.a2', 'a.a3']], ['b', ['b.b1', 'b.b2']]] as const) {
      const frame = nodes[group]!;
      for (const id of childNodes) {
        const child = nodes[id]!;
        expect(child.x).toBeGreaterThanOrEqual(0);
        expect(child.y).toBeGreaterThanOrEqual(0);
        expect(child.x + child.width).toBeLessThanOrEqual(frame.width);
        expect(child.y + child.height).toBeLessThanOrEqual(frame.height);
      }
    }
  });

  it('siblings do not overlap', async () => {
    const { nodes } = await layoutView(view(), NEUTRAL_THEME);
    const siblings = ['a.a1', 'a.a2', 'a.a3'].map((id) => nodes[id]!);

    for (const [i, p] of siblings.entries()) {
      for (const q of siblings.slice(i + 1)) {
        const apart =
          p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('the same input produces the same geometry', async () => {
    const first = await layoutView(view(), NEUTRAL_THEME);
    const second = await layoutView(view(), NEUTRAL_THEME);

    expect(second).toEqual(first);
  });

  it('a collapsed Group is a leaf Node with its own size', async () => {
    const { nodes } = await layoutView(view({}, { collapsed: ['a'] }), NEUTRAL_THEME);

    expect(Object.keys(nodes).sort()).toEqual(['a', 'b', 'b.b1', 'b.b2', 'c']);
  });

  it('a larger font size gives wider Nodes', async () => {
    const longLabel = view({ overrides: [{ node: 'c', label: 'Servicio de facturacion' }] });
    const normal = await layoutView(longLabel, withTheme({ tokens: { ...NEUTRAL_THEME.tokens, fontSize: '14px' } }));
    const large = await layoutView(longLabel, withTheme({ tokens: { ...NEUTRAL_THEME.tokens, fontSize: '28px' } }));

    expect(large.nodes['c']!.width).toBeGreaterThan(normal.nodes['c']!.width);
    expect(large.nodes['c']!.height).toBeGreaterThan(normal.nodes['c']!.height);
  });

  it('the label of an override counts for the size', async () => {
    const longLabel = view({ overrides: [{ node: 'c', label: 'Un nombre bastante largo para este Nodo' }] });

    const base = await layoutView(view(), NEUTRAL_THEME);
    const withOverrideLabel = await layoutView(longLabel, NEUTRAL_THEME);

    expect(withOverrideLabel.nodes['c']!.width).toBeGreaterThan(base.nodes['c']!.width);
  });
});

/** Box of a Node in canvas coordinates: adds the positions of its Groups. */
function absolute(geometry: Geometry, viewOf: ResolvedView, id: string): NodeBox {
  const parent = viewOf.nodes.find((candidate) => candidate.children.some((child) => child.id === id));
  const box = geometry.nodes[id]!;
  if (parent === undefined) return box;
  const frame = absolute(geometry, viewOf, parent.id);
  return { ...box, x: box.x + frame.x, y: box.y + frame.y };
}

const onTheBorder = (point: { x: number; y: number }, box: NodeBox): boolean => {
  const inside = point.x >= box.x - 1 && point.x <= box.x + box.width + 1 && point.y >= box.y - 1 && point.y <= box.y + box.height + 1;
  const onBorder = [box.x, box.x + box.width].some((x) => Math.abs(point.x - x) <= 1) || [box.y, box.y + box.height].some((y) => Math.abs(point.y - y) <= 1);
  return inside && onBorder;
};

describe('layoutView: Edge routes', () => {
  it('each Edge has an orthogonal route joining the borders of its ends', async () => {
    const v = view();
    const geometry = await layoutView(v, NEUTRAL_THEME);

    expect(Object.keys(geometry.edges).sort()).toEqual(v.edges.map(edgeId).sort());
    for (const edge of v.edges) {
      const { points } = geometry.edges[edgeId(edge)]!;
      expect(points.length).toBeGreaterThanOrEqual(2);
      expect(onTheBorder(points[0]!, absolute(geometry, v, edge.from.node))).toBe(true);
      expect(onTheBorder(points.at(-1)!, absolute(geometry, v, edge.to.node))).toBe(true);
      points.slice(1).forEach((point, i) => {
        const previous = points[i]!;
        expect(previous.x === point.x || previous.y === point.y).toBe(true);
      });
    }
  });

  it('Edges between different Groups are routed (a.a2 -> b.b1)', async () => {
    const v = view();
    const { edges } = await layoutView(v, NEUTRAL_THEME);

    expect(edges[edgeId({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })]!.points.length).toBeGreaterThanOrEqual(2);
  });

  it('Edges lifted to a collapsed Group are routed on its border', async () => {
    const v = view({}, { collapsed: ['a'] });
    const geometry = await layoutView(v, NEUTRAL_THEME);
    const lifted = v.edges.find((edge) => edge.from.node === 'a' && edge.to.node === 'b.b1')!;
    const { points } = geometry.edges[edgeId(lifted)]!;

    expect(onTheBorder(points[0]!, absolute(geometry, v, 'a'))).toBe(true);
  });

  it('routes are deterministic', async () => {
    const first = await layoutView(view(), NEUTRAL_THEME);
    const second = await layoutView(view(), NEUTRAL_THEME);

    expect(second.edges).toEqual(first.edges);
  });
});

describe('layoutKey', () => {
  it('changes with the font or the text size', () => {
    const base = layoutKey(view(), NEUTRAL_THEME);

    expect(layoutKey(view(), withTheme({ fonts: { ...NEUTRAL_THEME.fonts, body: 'Inter' } }))).not.toBe(base);
    expect(layoutKey(view(), withTheme({ tokens: { ...NEUTRAL_THEME.tokens, fontSize: '20px' } }))).not.toBe(base);
  });

  it('changes when the View type changes (layout and structure)', () => {
    const architecture = view();
    const flow = { ...architecture, type: 'flow' as const };

    expect(layoutKey(flow, NEUTRAL_THEME)).not.toBe(layoutKey(architecture, NEUTRAL_THEME));
    expect(structureKey(flow, NEUTRAL_THEME)).not.toBe(structureKey(architecture, NEUTRAL_THEME));
  });

  it('does not change with the palette, the colors or the icons', () => {
    const base = layoutKey(view(), NEUTRAL_THEME);
    const otherPalette = withTheme({ palette: { ...NEUTRAL_THEME.palette, blue: '#000000' }, tokens: { ...NEUTRAL_THEME.tokens, background: '#000' } });
    const colored = view({ overrides: [{ node: 'c', color: 'blue' }] });

    expect(layoutKey(view(), otherPalette)).toBe(base);
    expect(layoutKey(colored, NEUTRAL_THEME)).toBe(base);
  });

  it('changes when only a Pin changes and is stable without Pin changes', () => {
    const withPin = (x: number, y: number) => view({ overrides: [{ node: 'c', pin: { x, y } }] });
    const base = layoutKey(withPin(10, 20), NEUTRAL_THEME);

    expect(layoutKey(withPin(10, 20), NEUTRAL_THEME)).toBe(base);
    expect(layoutKey(withPin(11, 20), NEUTRAL_THEME)).not.toBe(base);
    expect(layoutKey(view(), NEUTRAL_THEME)).not.toBe(base);
  });

  it('changes with the structure: another collapse state', () => {
    expect(layoutKey(view({}, { collapsed: ['a'] }), NEUTRAL_THEME)).not.toBe(layoutKey(view(), NEUTRAL_THEME));
  });
});

describe('structureKey', () => {
  const withAttributes = (attributeList: Attribute[]): GraphView => {
    const base = view();
    const mark = (n: ResolvedView['nodes'][number]): ResolvedView['nodes'][number] =>
      n.id === 'c' ? { ...n, attributes: attributeList } : { ...n, children: n.children.map(mark) };
    return { ...base, nodes: base.nodes.map(mark) };
  };

  it('changes with the Attributes of a leaf Node (name or type)', () => {
    const base = structureKey(withAttributes([{ name: 'id', type: 'uuid', notes: '' }]), NEUTRAL_THEME);

    expect(structureKey(withAttributes([{ name: 'id', type: 'uuid', notes: '' }, { name: 'x', type: 'int', notes: '' }]), NEUTRAL_THEME)).not.toBe(base);
    expect(structureKey(withAttributes([{ name: 'id', type: 'texto largo', notes: '' }]), NEUTRAL_THEME)).not.toBe(base);
  });

  it('changes with the ends of an Edge to an Attribute', () => {
    const v = withAttributes([{ name: 'id', type: 'uuid', notes: '' }]);
    const toAttribute = { ...v, edges: v.edges.map((e) => (e.to.node === 'c' ? { ...e, to: { node: 'c', attribute: 'id' } } : e)) };

    expect(structureKey(toAttribute, NEUTRAL_THEME)).not.toBe(structureKey(v, NEUTRAL_THEME));
  });

  it('changes with the structure of Groups nested more than one level', () => {
    const base = view();
    const nest = (n: ResolvedView['nodes'][number]): ResolvedView['nodes'][number] =>
      n.id === 'a.a1' ? { ...n, children: [{ ...n, id: 'a.a1.x', children: [] }] } : { ...n, children: n.children.map(nest) };
    const deep = { ...base, nodes: base.nodes.map(nest) };

    expect(structureKey(deep, NEUTRAL_THEME)).not.toBe(structureKey(base, NEUTRAL_THEME));
  });

  it('does not change when a Pin moves', () => {
    const withPin = view({ overrides: [{ node: 'c', pin: { x: 5, y: 5 } }] });

    expect(structureKey(withPin, NEUTRAL_THEME)).toBe(structureKey(view(), NEUTRAL_THEME));
  });
});

describe('layoutView: Pin post-ELK', () => {
  const pin = (node: string, x: number, y: number) => ({ overrides: [{ node, pin: { x, y } }] });

  it('the center of the pinned Node lands exactly on its Pin, relative to its Group', async () => {
    const { nodes } = await layoutView(view(pin('a.a1', 200, 100)), NEUTRAL_THEME);
    const box = nodes['a.a1']!;

    expect(box.x + box.width / 2).toBe(200);
    expect(box.y + box.height / 2).toBe(100);
  });

  it('a Node that changes size grows around its Pin', async () => {
    const withOverrideLabel = (label: string) => view({ overrides: [{ node: 'a.a1', label, pin: { x: 200, y: 100 } }] });
    const shortOne = (await layoutView(withOverrideLabel('A'), NEUTRAL_THEME)).nodes['a.a1']!;
    const longLabel = (await layoutView(withOverrideLabel('Servicio de facturacion con nombre muy largo'), NEUTRAL_THEME)).nodes['a.a1']!;

    expect(longLabel.width).toBeGreaterThan(shortOne.width);
    for (const box of [shortOne, longLabel]) {
      expect(box.x + box.width / 2).toBe(200);
      expect(box.y + box.height / 2).toBe(100);
    }
  });

  it('non-incident Edges do not change and incident ones follow their Node', async () => {
    const free = await layoutView(view(), NEUTRAL_THEME);
    const pinned = await layoutView(view(pin('a.a1', 200, 100)), NEUTRAL_THEME);
    const a1 = pinned.nodes['a.a1']!;
    const group = pinned.nodes['a']!;

    expect(pinned.edges[edgeId({ from: { node: 'b.b2' }, to: { node: 'c' } })]).toEqual(
      free.edges[edgeId({ from: { node: 'b.b2' }, to: { node: 'c' } })],
    );
    expect(pinned.edges[edgeId({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })]).toEqual(
      free.edges[edgeId({ from: { node: 'a.a2' }, to: { node: 'b.b1' } })],
    );
    const [start] = pinned.edges[edgeId({ from: { node: 'a.a1' }, to: { node: 'a.a2' } })]!.points;
    const absoluteA1 = { x: group.x + a1.x, y: group.y + a1.y };
    const onEdge =
      (start!.x === absoluteA1.x || start!.x === absoluteA1.x + a1.width) &&
      start!.y >= absoluteA1.y && start!.y <= absoluteA1.y + a1.height;
    const onHorizontalEdge =
      (start!.y === absoluteA1.y || start!.y === absoluteA1.y + a1.height) &&
      start!.x >= absoluteA1.x && start!.x <= absoluteA1.x + a1.width;
    expect(onEdge || onHorizontalEdge).toBe(true);
  });

  it('a Pin on a Node missing from the View is ignored', async () => {
    const free = await layoutView(view(), NEUTRAL_THEME);

    expect(await layoutView(view(pin('a.zzz', 5, 5)), NEUTRAL_THEME)).toEqual(free);
  });

  it('two overlapping Pins are reported as a pair of ids; without overlap, empty', async () => {
    const overlapping = await layoutView({ ...view({ overrides: [{ node: 'c', pin: { x: 500, y: 500 } }, { node: 'b', pin: { x: 500, y: 500 } }] }) }, NEUTRAL_THEME);
    const apart = await layoutView(view({ overrides: [{ node: 'c', pin: { x: 900, y: 900 } }, { node: 'b', pin: { x: 0, y: 0 } }] }), NEUTRAL_THEME);

    expect(overlapping.pinsSolapados).toEqual([['b', 'c']]);
    expect(apart.pinsSolapados).toEqual([]);
  });

  it('pinning a Group moves its inner Edges with it and keeps their shape', async () => {
    const free = await layoutView(view(), NEUTRAL_THEME);
    const pinned = await layoutView(view(pin('a', 300, 200)), NEUTRAL_THEME);
    const id = edgeId({ from: { node: 'a.a1' }, to: { node: 'a.a2' } });
    const before = free.edges[id]!.points;
    const after = pinned.edges[id]!.points;
    const dx = after[0]!.x - before[0]!.x;
    const dy = after[0]!.y - before[0]!.y;

    expect(dx !== 0 || dy !== 0).toBe(true);
    expect(after).toEqual(before.map(({ x, y }) => ({ x: x + dx, y: y + dy })));
  });

  it('a pinned Group and its pinned child do not count as overlap', async () => {
    const { pinsSolapados } = await layoutView(
      view({ overrides: [{ node: 'a', pin: { x: 0, y: 0 } }, { node: 'a.a1', pin: { x: 20, y: 40 } }] }),
      NEUTRAL_THEME,
    );

    expect(pinsSolapados).toEqual([]);
  });

  it('with overlapping pinned Nodes the route does not double back inside the boxes', async () => {
    const { edges } = await layoutView(
      view({ overrides: [{ node: 'a.a2', pin: { x: 40, y: 40 } }, { node: 'a.a1', pin: { x: 50, y: 50 } }] }),
      NEUTRAL_THEME,
    );
    const { points } = edges[edgeId({ from: { node: 'a.a1' }, to: { node: 'a.a2' } })]!;

    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const p of points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('the Pin is deterministic', async () => {
    const a = await layoutView(view(pin('a.a1', 200, 100)), NEUTRAL_THEME);
    const b = await layoutView(view(pin('a.a1', 200, 100)), NEUTRAL_THEME);
    expect(a).toEqual(b);
  });
});

describe('layoutView: Nodes with Attributes', () => {
  const table = (attributeList: { name: string; type: string }[]) => ({ ...node('t'), attributes: attributeList });
  function withAttributes(attributeList: { name: string; type: string }[]): ResolvedView {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [table(attributeList), node('s')],
        edges: [{ from: { node: 's' }, to: { node: 't', attribute: 'email' } }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return resolveView(source, 'v')!;
  }
  const columns = [{ name: 'id', type: 'uuid', notes: '' }, { name: 'email', type: 'text' }, { name: 'creado', type: 'timestamp' }];

  it('the Node with Attributes is taller, one row per Attribute, and its size covers them', async () => {
    const without = await layoutView(withAttributes(columns.slice(1, 2)), NEUTRAL_THEME);
    const withAll = await layoutView(withAttributes(columns), NEUTRAL_THEME);
    const { cabecera: header, fila: row } = metricsOf(NEUTRAL_THEME, 'architecture');

    expect(withAll.nodes['t']!.height).toBeGreaterThanOrEqual(header + columns.length * row);
    expect(withAll.nodes['t']!.height - without.nodes['t']!.height).toBe((columns.length - 1) * row);
  });

  it('a long Attribute widens the Node', async () => {
    const shortOne = await layoutView(withAttributes(columns), NEUTRAL_THEME);
    const longLabel = await layoutView(
      withAttributes([...columns, { name: 'un_nombre_de_columna_muy_largo_para_el_nodo', type: 'character varying(255)' }]),
      NEUTRAL_THEME,
    );

    expect(longLabel.nodes['t']!.width).toBeGreaterThan(shortOne.nodes['t']!.width);
  });

  it('an Edge to node#attribute ends at the row of that Attribute, on the border', async () => {
    const { nodes, edges } = await layoutView(withAttributes(columns), NEUTRAL_THEME);
    const { cabecera: header, fila: row } = metricsOf(NEUTRAL_THEME, 'architecture');
    const box = nodes['t']!;
    const { points } = edges[edgeId({ from: { node: 's' }, to: { node: 't', attribute: 'email' } })]!;
    const end = points[points.length - 1]!;
    const previous = points[points.length - 2]!;

    expect(end.y).toBe(box.y + header + 1.5 * row);
    expect(end.x === box.x || end.x === box.x + box.width).toBe(true);
    expect(previous.y).toBe(end.y);
  });
});

describe('Metrics', () => {
  const table = (attributeList: { name: string; type: string }[]) => {
    const source = canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [{ ...node('t'), attributes: attributeList }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    });
    return resolveView(source, 'v')!;
  };
  const longLabel = [{ name: 'columna_con_un_nombre_larguisimo_para_medir', type: 'varchar' }];

  it('they derive from the Theme: another text size, other Metrics', () => {
    const base = metricsOf(NEUTRAL_THEME, 'architecture');
    const large = metricsOf(withTheme({ tokens: { ...NEUTRAL_THEME.tokens, fontSize: '28px' } }), 'architecture');

    expect(large.cabecera).toBeGreaterThan(base.cabecera);
    expect(large.fila).toBeGreaterThan(base.fila);
  });

  it('the layout key depends on the Metrics', () => {
    const base = metricsOf(NEUTRAL_THEME, 'architecture');

    expect(layoutKey(view(), NEUTRAL_THEME, { ...base, paddingHorizontal: base.paddingHorizontal + 8 })).not.toBe(
      layoutKey(view(), NEUTRAL_THEME),
    );
    expect(layoutKey(view(), NEUTRAL_THEME, metricsTable(NEUTRAL_THEME, 'architecture'))).toBe(layoutKey(view(), NEUTRAL_THEME));
  });

  it('changing a Metric moves the layout: more padding, wider Node; taller row, taller Node', async () => {
    const base = metricsOf(NEUTRAL_THEME, 'architecture');
    const v = table(longLabel);
    const normal = (await layoutView(v, NEUTRAL_THEME)).nodes['t']!;
    const width = (await layoutView(v, NEUTRAL_THEME, { metricas: { ...base, paddingHorizontal: base.paddingHorizontal + 20 } })).nodes['t']!;
    const height = (await layoutView(v, NEUTRAL_THEME, { metricas: { ...base, fila: base.fila + 10 } })).nodes['t']!;

    expect(width.width).toBe(normal.width + 20);
    expect(height.height).toBe(normal.height + 10);
  });

  it('an Attribute is measured with the scale it is drawn with', async () => {
    const m = metricsOf(NEUTRAL_THEME, 'architecture');
    const text = 'columna_con_un_nombre_larguisimo_para_medir: varchar';
    const { width } = (await layoutView(table(longLabel), NEUTRAL_THEME)).nodes['t']!;

    expect(width).toBe(Math.ceil(text.length * m.fontSize * m.escalaAtributo * m.factorDeAncho + m.paddingHorizontal));
  });
});

describe('Pin without ELK relayout', () => {
  const withPin = (x: number, y: number) => view({ overrides: [{ node: 'a.a1', pin: { x, y } }] });

  it('the structure key ignores the Pins but not the structure', () => {
    const base = structureKey(view(), NEUTRAL_THEME);

    expect(structureKey(withPin(10, 20), NEUTRAL_THEME)).toBe(base);
    expect(structureKey(withPin(30, 40), NEUTRAL_THEME)).toBe(base);
    expect(structureKey(view({}, { collapsed: ['a'] }), NEUTRAL_THEME)).not.toBe(base);
  });

  it('applying Pins to the geometry without Pins gives the same as a full layout', async () => {
    const withoutPins = await layoutView(view(), NEUTRAL_THEME);

    for (const [x, y] of [[200, 100], [210, 90]] as const) {
      expect(applyPinsToGeometry(withPin(x, y), withoutPins, NEUTRAL_THEME)).toEqual(await layoutView(withPin(x, y), NEUTRAL_THEME));
    }
  });
});
