import { describe, expect, it } from 'vitest';

import { CATALOG, NEUTRAL_THEME, placeInBox, placeNode, buildPrimitive, resolvedStyle, metricsOf, resolveTheme, resolvedThemeSchema } from 'theme';

describe('Theme contract', () => {
  it('accepts the neutral Theme and one with extra tokens', () => {
    expect(resolvedThemeSchema.safeParse(NEUTRAL_THEME).success).toBe(true);
    expect(resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: '16px', surface: '#eee' } }).success).toBe(true);
  });

  it('a Theme without a required token or font fails pointing at the path', () => {
    const { border: _borde, ...tokens } = NEUTRAL_THEME.tokens;
    const withoutBorder = resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, tokens });
    const withoutMono = resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, fonts: { body: 'serif' } });

    expect(withoutBorder.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.border']);
    expect(withoutMono.error?.issues.map((i) => i.path.join('.'))).toEqual(['fonts.mono']);
  });

  it('a fontSize that is not px fails', () => {
    const bad = resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: 'grande' } });

    expect(bad.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.fontSize']);
  });

  it('old Themes (nodeStyles, edgeStyles) are no longer accepted', () => {
    expect(resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, nodeStyles: { servicio: { fill: '#fff' } } }).success).toBe(false);
    expect(resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, edgeStyles: { default: { stroke: 'red' } } }).success).toBe(false);
    expect(() => resolveTheme({ ...NEUTRAL_THEME, nodeStyles: {} })).toThrow(/nodeStyles/);
  });

  it('a Layer with an invalid Primitive or property fails with the Layer path', () => {
    const layer = (primitive: unknown) => ({ ...NEUTRAL_THEME, nodo: { capas: [{ nombre: 'c', primitiva: primitive }], slots: NEUTRAL_THEME.nodo.slots } });

    expect(resolvedThemeSchema.safeParse(layer({ tipo: 'rect', props: { radius: 999 } })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(layer({ tipo: 'solid', props: { color: 'inexistente' } })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(layer({ tipo: 'nada', props: {} })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(layer({ tipo: 'solid', props: { color: 'blue' } })).success).toBe(true);
  });
});

describe('catalog', () => {
  it('fills the defaults and rejects without clamping', () => {
    expect(buildPrimitive('rect', [], {}).primitive).toEqual({ tipo: 'rect', props: { radius: 0 } });
    expect(buildPrimitive('border', [{ key: 'color', value: 'a' }], { a: '#000' }).primitive).toEqual({ tipo: 'border', props: { color: 'a', width: 1 } });
    expect(buildPrimitive('rect', [{ key: 'radius', value: '101' }], {}).errors.map((e) => e.code)).toEqual(['theme-invalid-value']);
    expect(buildPrimitive('rect', [{ key: 'radius', value: 'x' }], {}).primitive).toBeUndefined();
  });

  it('suggests the nearest candidate for a misspelled Primitive', () => {
    const [error] = buildPrimitive('sollid', [], {}).errors;

    expect(error).toMatchObject({ code: 'theme-unknown-primitive', hint: "did you mean 'solid'" });
  });

  it('only circle and the Slot and label text styles affect the Metrics, and circle asks for a square box', () => {
    const affecting = Object.entries(CATALOG).filter(([, p]) => p.affectsMetrics).map(([name]) => name);
    const square = Object.entries(CATALOG).filter(([, p]) => 'minimumBox' in p).map(([name]) => name);

    expect(affecting).toEqual(['circle', 'text', 'chip', 'icon', 'label']);
    expect(square).toEqual(['circle']);
  });

  it.each([
    ['cut', 'cut', 0],
    ['cut', 'cut', 101],
    ['gradient', 'angle', 361],
    ['grid', 'size', 1],
    ['lines', 'angle', 181],
    ['dots', 'radius', 0],
    ['noise', 'opacity', 1.5],
    ['noise', 'frequency', 0],
    ['dashed', 'width', 17],
    ['outline', 'offset', -17],
  ])('%s: %s=%s fuera de rango es error y no se recorta', (kind, key, value) => {
    const palette = { a: '#000', b: '#fff' };
    const colors = ['color', 'from', 'to'].filter((c) => Object.hasOwn(CATALOG[kind as keyof typeof CATALOG].properties, c)).map((c) => ({ key: c, value: 'a' }));
    const { primitive, errors } = buildPrimitive(kind, [...colors, { key, value }], palette);

    expect(primitive).toBeUndefined();
    expect(errors.map((e) => e.code)).toEqual(['theme-invalid-value']);
  });
});

describe('Metrics and Slot placement', () => {
  const metrics = metricsOf(NEUTRAL_THEME, 'architecture');

  it('a circle shape gives a square box that holds the content, vertically centered', () => {
    const circle = metricsOf({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: [{ nombre: 'forma', primitiva: { tipo: 'circle', props: {} } }] } }, 'architecture');
    const placed = placeNode({ titulo: 'API', atributos: [], icono: false }, circle);

    expect(metrics.cajaCuadrada).toBe(false);
    expect(circle.cajaCuadrada).toBe(true);
    expect(placed.width).toBe(placed.height);
    expect(placed.width).toBe(Math.max(120, circle.cabecera));
    expect(placed.slots.title).toEqual({ x: 0, y: (placed.height - circle.cabecera) / 2, width: placed.width, height: circle.cabecera });
  });

  it('a Node without Attributes measures the header; with Attributes it adds a row for each', () => {
    const plain = placeNode({ titulo: 'API', atributos: [], icono: false }, metrics);
    const withAttributes = placeNode({ titulo: 'API', atributos: [{ name: 'id', type: 'int', notes: '' }, { name: 'nombre', type: 'texto', notes: '' }], icono: false }, metrics);

    expect(plain).toMatchObject({ width: 120, height: metrics.cabecera, filas: [] });
    expect(withAttributes.height).toBe(metrics.cabecera + 2 * metrics.fila);
    expect(withAttributes.filas).toEqual([
      { x: 0, y: metrics.cabecera, width: withAttributes.width, height: metrics.fila },
      { x: 0, y: metrics.cabecera + metrics.fila, width: withAttributes.width, height: metrics.fila },
    ]);
  });

  it('the width comes from the longest text among the shown Slots', () => {
    const length = 'un titulo bastante largo para forzar el ancho';
    const withoutTitle = { ...metrics, disposicion: { direccion: 'column' as const, gap: 0, pad: 0, hijos: [{ slot: 'attrs' as const }] } };

    expect(placeNode({ titulo: length, atributos: [], icono: false }, metrics).width).toBeGreaterThan(120);
    expect(placeNode({ titulo: length, atributos: [], icono: false }, withoutTitle).width).toBe(120);
  });

  it('the Metrics do not change with the Theme paint', () => {
    const other = { ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: [{ nombre: 'f', primitiva: { tipo: 'solid', props: { color: 'blue' } } }] } };

    expect(resolvedStyle(other, { diagrama: 'architecture' }).metricas).toEqual(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).metricas);
    expect(resolvedStyle(other, { diagrama: 'architecture' }).pintura).not.toEqual(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).pintura);
    expect(placeInBox(metrics, { titulo: 'x', atributos: [{ name: 'a', type: 't', notes: '' }], icono: false }, 200).slots.title).toEqual({ x: 0, y: 0, width: 200, height: metrics.cabecera });
  });
});
