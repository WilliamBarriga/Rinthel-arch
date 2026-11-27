import { describe, expect, it } from 'vitest';

import { HIGH_CONTRAST_THEME, NEUTRAL_THEME, contrastWarnings, buildPrimitive, themeLegend, contrastRatio, colorOnlyKinds } from 'theme';
import type { ResolvedTheme, PrimitivePlacement } from 'theme';

type Primitive = { tipo: string; props: Record<string, string | number> };

const layer = (name: string, kind: string, props: Record<string, string | number>) => ({ nombre: name, primitiva: { tipo: kind, props } });

const theme = (
  palette: Record<string, string>,
  layers: ReturnType<typeof layer>[],
  extra: Record<string, unknown> = {},
  tokens: Partial<ResolvedTheme['tokens']> = {},
): ResolvedTheme =>
  ({
    ...NEUTRAL_THEME,
    name: 't',
    palette,
    tokens: { ...NEUTRAL_THEME.tokens, ...tokens },
    nodo: { capas: layers, slots: NEUTRAL_THEME.nodo.slots, tipos: {}, estados: {}, ...extra },
  }) as ResolvedTheme;

describe('contrast ratio (WCAG)', () => {
  it('black on white is 21:1 and a color on itself 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('contrast warnings', () => {
  it('a light fill with light text warns 4.5:1 per Node kind, and readable Node kinds do not warn', () => {
    const t = theme(
      { claro: '#f0f0f0', oscuro: '#111111', borde: '#000000' },
      [layer('relleno', 'solid', { color: 'COLOR' }), layer('borde', 'border', { color: 'borde', width: 2 })],
      {},
      { foreground: '#ffffff' },
    );
    const notices = contrastWarnings(t, { malo: 'claro', bueno: 'oscuro' });

    expect(notices.map((a) => [a.tipo, a.estado, a.parte])).toEqual([['malo', 'base', 'texto']]);
    expect(notices[0]!.mensaje).toMatch(/4\.5:1/);
  });

  it('a pale border on the background warns 3:1 for graphics', () => {
    const t = theme({ palido: '#eeeeee' }, [layer('borde', 'border', { color: 'palido', width: 1 })]);

    expect(contrastWarnings(t, { x: undefined }).map((a) => a.parte)).toEqual(['grafico']);
  });

  it.each(['dashed', 'dotted', 'outline'])('a pale border of the border Family (%s) also warns 3:1', (kind) => {
    const t = theme({ palido: '#eeeeee' }, [layer('borde', kind, { color: 'palido', width: 1 })]);

    expect(contrastWarnings(t, { x: undefined }).map((a) => a.parte)).toEqual(['grafico']);
  });

  it('warns per state when only the patch worsens the contrast', () => {
    const t = theme(
      { oscuro: '#111111', claro: '#f5f5f5' },
      [layer('relleno', 'solid', { color: 'oscuro' })],
      { estados: { dimmed: [{ nombre: 'relleno', props: { color: 'claro' } }] } },
      { foreground: '#ffffff' },
    );
    const notices = contrastWarnings(t, { x: undefined });

    expect(notices.map((a) => [a.estado, a.parte, a.capa])).toEqual([['dimmed', 'texto', 'relleno']]);
  });

  it('the built-in Themes neutral and high-contrast give no warnings', () => {
    expect(contrastWarnings(NEUTRAL_THEME, { servicio: 'blue' })).toEqual([]);
    expect(contrastWarnings(HIGH_CONTRAST_THEME, { servicio: 'blue', db: 'green' })).toEqual([]);
  });

  it('high-contrast arrives already resolved: each Primitive carries the catalog defaults, as if it came from dsl', () => {
    const t = HIGH_CONTRAST_THEME;
    const primitives: Array<[Primitive, PrimitivePlacement]> = [
      ...t.pagina.capas.map((c): [Primitive, PrimitivePlacement] => [c.primitiva, 'capa-pagina']),
      ...[...t.nodo.capas, ...t.grupo.capas].map((c): [Primitive, PrimitivePlacement] => [c.primitiva, 'capa-nodo']),
      ...[...Object.values(t.nodo.textos), ...Object.values(t.grupo.textos)].map((p): [Primitive, PrimitivePlacement] => [p, 'texto-slot']),
      ...t.arista.capas.map((c): [Primitive, PrimitivePlacement] => [c.primitiva, 'capa-arista']),
      ...[t.arista.fin, t.arista.origen].flatMap((p): Array<[Primitive, PrimitivePlacement]> => (p === undefined ? [] : [[p, 'marcador']])),
      ...(t.arista.etiqueta === undefined ? [] : [[t.arista.etiqueta, 'etiqueta'] as [Primitive, PrimitivePlacement]]),
    ];
    for (const [primitive, placement] of primitives) {
      const props = Object.entries(primitive.props).map(([key, value]) => ({ clave: key, valor: value }));
      expect(buildPrimitive(primitive.tipo, props, t.palette, placement).primitiva, primitive.tipo).toEqual(primitive);
    }
  });
});

describe('color only', () => {
  const layers = [layer('forma', 'rect', { radius: 4 }), layer('relleno', 'solid', { color: 'COLOR' })];
  const byColor = theme({ a: '#cc0000', b: '#0000cc' }, layers);
  const byShape = theme({ a: '#cc0000', b: '#0000cc' }, layers, { tipos: { db: [{ nombre: 'forma', props: { radius: 30 } }] } });
  const kinds = [
    { name: 'api', color: 'a' },
    { name: 'db', color: 'b' },
  ];

  it('two Node kinds that differ only by Palette color are paired', () => {
    expect(colorOnlyKinds(byColor, undefined, kinds)).toEqual([['api', 'db']]);
  });

  it('another shape, another icon or a Theme that ignores COLOR are not color only', () => {
    expect(colorOnlyKinds(byShape, undefined, kinds)).toEqual([]);
    expect(colorOnlyKinds(byColor, undefined, [{ ...kinds[0]!, icon: 'x' }, { ...kinds[1]!, icon: 'y' }])).toEqual([]);
    const blind = theme({ a: '#cc0000', b: '#0000cc' }, [layer('relleno', 'solid', { color: 'a' })]);
    expect(colorOnlyKinds(blind, undefined, kinds)).toEqual([]);
  });

  it('the legend lists Node kind, shape and color, and is requested on its own only when there is color only', () => {
    expect(themeLegend(byColor, undefined, kinds)).toEqual({
      necesaria: true,
      entradas: [
        { tipo: 'api', forma: 'rect', color: '#cc0000' },
        { tipo: 'db', forma: 'rect', color: '#0000cc' },
      ],
    });
    expect(themeLegend(byShape, undefined, kinds).necesaria).toBe(false);
  });
});
