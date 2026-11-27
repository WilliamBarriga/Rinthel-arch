import { describe, expect, it } from 'vitest';

import type { Theme } from 'canonical';
import { NEUTRAL_THEME, cascade, placeInBox, resolvedStyle, metricsTable, resolvedThemeSchema, textsToMeasure } from 'theme';
import type { LayerOp } from 'theme';

const layer = (name: string, kind: string, props: Record<string, number | string>) => ({ nombre: name, primitiva: { tipo: kind, props } });
const op = (name: string, props: Record<string, number | string>, primitive?: string): LayerOp => ({ nombre: name, props, ...(primitive !== undefined && { primitiva: primitive }) });

const withNode = { ...NEUTRAL_THEME.nodo, capas: [layer('caja', 'rect', { radius: 3 }), layer('relleno', 'solid', { color: 'red' })] };
const theme = (group: Record<string, unknown> = {}): Theme => ({ ...NEUTRAL_THEME, nodo: withNode, grupo: { ...NEUTRAL_THEME.grupo, ...group } }) as Theme;

describe('Theme Group: own stack', () => {
  it('a Theme without group resolves a plain Group from its tokens, never the Node Layers', () => {
    for (const withoutGroup of [theme(), NEUTRAL_THEME as Theme]) {
      const { abierto: open, colapsado: collapsed } = resolvedStyle(withoutGroup, { diagrama: 'architecture' }).pintura.grupo;
      const nodeNames = resolvedStyle(withoutGroup, { diagrama: 'architecture' }).pintura.nodo.capas.map((c) => c.nombre);

      expect(open.capas.map((c) => c.nombre)).toEqual(['box', 'fill', 'border']);
      expect(open.capas.find((c) => c.nombre === 'fill')?.props['color']).toContain((withoutGroup.tokens as Record<string, string>)['foreground']);
      expect(open.capas.find((c) => c.nombre === 'border')?.tipo).toBe('border');
      expect(collapsed.capas.find((c) => c.nombre === 'border')?.tipo).toBe('dashed');
      if (nodeNames.length > 0) expect(open.capas).not.toEqual(resolvedStyle(withoutGroup, { diagrama: 'architecture' }).pintura.nodo.capas);
    }
    expect(resolvedStyle(theme(), { diagrama: 'architecture' }).pintura.grupo.abierto.capas.find((c) => c.nombre === 'relleno')?.props['color']).not.toBe('#dc2626');
  });

  it('with its own Layers, the Group cascade is base, Node kind, collapsed and state, without touching the Node ones', () => {
    const t = theme({
      capas: [layer('caja', 'rect', { radius: 16 }), layer('borde', 'border', { color: 'gray', width: 1 })],
      tipos: { capa: [op('borde', { color: 'blue' })] },
      colapsado: { ops: [op('borde', { width: 3 })] },
      estados: { hover: [op('borde', { color: 'green' })] },
    });
    const group = (level: Parameters<typeof cascade>[1]) => cascade(resolvedThemeSchema.parse(t), level, 'grupo').find((c) => c.nombre === 'borde')?.primitiva.props;

    expect(group({})).toMatchObject({ color: 'gray', width: 1 });
    expect(group({ tipo: 'capa' })).toMatchObject({ color: 'blue', width: 1 });
    expect(group({ tipo: 'capa', colapsado: true })).toMatchObject({ color: 'blue', width: 3 });
    expect(group({ colapsado: true, estado: 'hover' })).toMatchObject({ color: 'green', width: 3 });
    expect(cascade(resolvedThemeSchema.parse(t)).map((c) => c.nombre)).toEqual(['caja', 'relleno']);
    const paint = resolvedStyle(t, { diagrama: 'architecture' }).pintura;
    expect(paint.grupo.abierto.tipos['capa']?.capas.find((c) => c.nombre === 'borde')?.props['color']).toBe('#2563eb');
    expect(paint.grupo.colapsado.estados['hover']?.find((c) => c.nombre === 'borde')?.props['width']).toBe(3);
    expect(paint.nodo.capas.map((c) => c.nombre)).toEqual(['caja', 'relleno']);
  });

  it('a state or Node kind patch of the Group cannot touch the Metrics; the collapsed one can', () => {
    const base = { capas: [layer('forma', 'rect', { radius: 4 })] };

    expect(resolvedThemeSchema.safeParse(theme({ ...base, estados: { hover: [op('forma', {}, 'circle')] } })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(theme({ ...base, tipos: { x: [op('forma', {}, 'circle')] } })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(theme({ ...base, colapsado: { ops: [op('forma', {}, 'circle')] } })).success).toBe(true);
  });

  it('the header does not accept the attrs Slot and validates the patches against the Group stack', () => {
    const withAttributes = resolvedThemeSchema.safeParse(theme({ slots: { direccion: 'row', gap: 0, pad: 0, hijos: [{ slot: 'attrs' }] } }));
    const withoutLayer = resolvedThemeSchema.safeParse(theme({ estados: { hover: [op('borde', { color: 'blue' })] } }));

    expect(withAttributes.error?.issues.map((i) => i.path.join('.'))).toEqual(['grupo.slots']);
    expect(withoutLayer.error?.issues.map((i) => i.path.slice(0, 3).join('.'))).toEqual(['grupo.estados.hover']);
  });
});

describe('Theme Group: Metrics', () => {
  it('the top padding of the open Group is the header height plus the children area padding', () => {
    const small = metricsTable(theme({ padding: { top: 5, left: 7, bottom: 9, right: 11 } }), 'architecture').grupoAbierto;
    const large = metricsTable(theme({ padding: { top: 25, left: 7, bottom: 9, right: 11 } }), 'architecture').grupoAbierto;
    const header = placeInBox(small, { titulo: '', atributos: [], icono: true }, 200);

    expect(small.paddingGrupo).toMatchObject({ left: 7, bottom: 9, right: 11 });
    expect(small.paddingGrupo.top).toBe(header.height + 5);
    expect(large.paddingGrupo.top - small.paddingGrupo.top).toBe(20);
  });

  it('a taller header (icon in a large box, bigger text) pushes the children and never overlaps them', () => {
    const tall = theme({
      slots: { direccion: 'row', gap: 6, pad: 6, hijos: [{ slot: 'icon' }, { slot: 'title' }] },
      textos: { icon: { tipo: 'icon', props: { variant: 'box', side: 40, radius: 6 } }, title: { tipo: 'text', props: { size: 2 } } },
    });
    const normal = metricsTable(theme(), 'architecture').grupoAbierto;
    const metrics = metricsTable(tall, 'architecture').grupoAbierto;
    const { slots, height } = placeInBox(metrics, { titulo: 'x', atributos: [], icono: true }, 300);

    expect(metrics.paddingGrupo.top).toBeGreaterThan(normal.paddingGrupo.top);
    expect(height).toBeLessThanOrEqual(metrics.paddingGrupo.top);
    for (const rect of Object.values(slots)) expect(rect.y + rect.height).toBeLessThanOrEqual(metrics.paddingGrupo.top);
  });

  it('the minimum width of the open Group is its header width; a chip is measured at its natural width', () => {
    const chip = theme({ textos: { title: { tipo: 'text', props: { size: 1, fill: 'blue', pad: 10, dot: 'blue' } } } });
    const open = metricsTable(chip, 'architecture').grupoAbierto;
    const length = placeInBox(open, { titulo: 'plataforma', atributos: [], icono: false }, 400);
    const short = placeInBox(open, { titulo: 'x', atributos: [], icono: false }, 400);

    expect(open.anchoMinimo).toBe(0);
    expect(length.slots.title!.width).toBeGreaterThan(short.slots.title!.width);
    expect(length.slots.title!.width).toBeLessThan(400 - 2 * 6);
    // The dot (one `size` in em) and the padding (pad on each side) go into the chip width.
    expect(short.slots.title!.width).toBeGreaterThanOrEqual(2 * 10 + open.fontSize);
  });

  it('the Collapsed group is a leaf with its own Slots, and uppercase and tracking texts widen the measured title', () => {
    const t = theme({
      colapsado: { ops: [], slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }] } },
      textos: { title: { tipo: 'text', props: { transform: 'uppercase', tracking: 0.2, size: 0.8 } } },
    });
    const table = metricsTable(t, 'architecture');
    const texts = textsToMeasure({ nodes: [{ id: 'g', type: 'capa', children: [{ id: 'h', children: [] }], label: 'plataforma', attributes: [], source: [], description: '', collapsed: false, childCount: 1 }], edges: [] } as never, table).map((m) => m.texto);

    expect(table.grupoColapsado.disposicion.hijos).toEqual([{ slot: 'title' }]);
    // Without a Slots patch, the closed Group uses the Node ones (a leaf), not the header.
    expect(metricsTable(theme(), 'architecture').grupoColapsado.disposicion).toEqual(NEUTRAL_THEME.nodo.slots);
    expect(table.grupoAbierto.disposicion.hijos.map((h) => ('slot' in h ? h.slot : '?'))).toEqual(['icon', 'title']);
    expect(texts).toContain('PLATAFORMA');
    expect(metricsTable(theme(), 'architecture').grupoAbierto.titulo).toMatchObject({ tracking: 0, mayusculas: false });
  });
});
