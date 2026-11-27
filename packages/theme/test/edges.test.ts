import { describe, expect, it } from 'vitest';

import { NEUTRAL_THEME, buildPrimitive, resolvedStyle, metricsOf, resolveTheme, labelSize, resolvedThemeSchema } from 'theme';
import type { ResolvedTheme } from 'theme';

const palette = { blue: '#2563eb', paper: '#ffffff' };
const line = (name: string, props: Record<string, string | number>) => ({ nombre: name, primitiva: { tipo: 'line', props } });

const withEdge = (edge: Partial<ResolvedTheme['arista']>): ResolvedTheme => ({
  ...NEUTRAL_THEME,
  arista: { ...NEUTRAL_THEME.arista, ...edge },
});

const GLOW = withEdge({
  capas: [
    line('glow', { color: 'ORIGIN/0.3', width: 8, style: 'solid', corner: 'sharp', cut: 6, radius: 8 }),
    line('principal', { color: 'ORIGIN', width: 2, style: 'solid', corner: 'sharp', cut: 6, radius: 8 }),
  ],
});

describe('stroke Family', () => {
  it('fills the defaults and accepts the four styles and the chamfer corner', () => {
    for (const style of ['solid', 'dashed', 'dotted', 'pixel']) {
      expect(buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'style', value: style }], palette, 'capa-arista').errors).toEqual([]);
    }
    expect(buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'corner', value: 'chamfer' }], palette, 'capa-arista').primitive?.props).toEqual({
      color: 'blue',
      width: 1.5,
      style: 'solid',
      corner: 'chamfer',
      cut: 6,
      radius: 8,
    });
  });

  it('accepts the round corner with its radius and rejects an out-of-range radius', () => {
    const ok = buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'corner', value: 'round' }, { key: 'radius', value: 12 }], palette, 'capa-arista');
    const bad = buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'radius', value: 999 }], palette, 'capa-arista');

    expect(ok.errors).toEqual([]);
    expect(ok.primitive?.props).toMatchObject({ corner: 'round', radius: 12 });
    expect(bad.errors[0]?.code).toBe('theme-invalid-value');
  });

  it('rejects an unknown style with a suggestion and an out-of-range width without clamping', () => {
    const [style] = buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'style', value: 'dashd' }], palette, 'capa-arista').errors;
    const [thickness] = buildPrimitive('line', [{ key: 'color', value: 'blue' }, { key: 'width', value: 99 }], palette, 'capa-arista').errors;

    expect(style).toMatchObject({ code: 'theme-invalid-value', hint: "did you mean 'dashed'" });
    expect(thickness?.code).toBe('theme-invalid-value');
  });

  it('a stroke is not valid as a Node Layer nor a Node Layer as a stroke', () => {
    expect(buildPrimitive('line', [], palette).errors[0]).toMatchObject({ code: 'theme-unknown-primitive' });
    expect(buildPrimitive('solid', [], palette, 'capa-arista').errors[0]).toMatchObject({ code: 'theme-unknown-primitive' });
    expect(resolvedThemeSchema.safeParse(withEdge({ capas: [{ nombre: 'x', primitiva: { tipo: 'solid', props: { color: 'blue' } } }] })).success).toBe(false);
  });

  it('ORIGIN is valid on an Edge and not on a Node', () => {
    expect(buildPrimitive('line', [{ key: 'color', value: 'ORIGIN' }], palette, 'capa-arista').errors).toEqual([]);
    expect(buildPrimitive('solid', [{ key: 'color', value: 'ORIGIN' }], palette).errors).toHaveLength(1);
  });
});

describe('marker Family', () => {
  it('accepts the catalog markers, including via, with an optional color', () => {
    for (const kind of ['arrow', 'dot', 'diamond', 'bar', 'via']) {
      expect(buildPrimitive(kind, [], palette, 'marcador').primitive).toEqual({ tipo: kind, props: { size: 8 } });
    }
    expect(buildPrimitive('arrow', [{ key: 'size', value: 1 }], palette, 'marcador').errors).toHaveLength(1);
  });
});

describe('Edge paint', () => {
  it('a second wide translucent stroke produces glow under the main stroke', () => {
    const { capas: layers } = resolvedStyle(GLOW, { diagrama: 'architecture' }).pintura.arista.origenes['blue']!;

    expect(layers.map((c) => c.nombre)).toEqual(['glow', 'principal']);
    expect(layers[0]?.props).toMatchObject({ color: 'rgba(37, 99, 235, 0.3)', width: 8 });
    expect(layers[1]?.props).toMatchObject({ color: '#2563eb', width: 2 });
  });

  it('ORIGIN takes the color of the source Node; without a known source, the Theme border', () => {
    const { arista: edge } = resolvedStyle(GLOW, { diagrama: 'architecture' }).pintura;

    expect(edge.origenes['green']?.capas[1]?.props['color']).toBe(NEUTRAL_THEME.palette['green']);
    expect(edge.capas[1]?.props['color']).toBe(NEUTRAL_THEME.tokens.border);
  });

  it('without declared strokes there is a line of the border color, and the marker without color takes the first stroke one', () => {
    const { arista: edge } = resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).pintura;

    expect(edge.capas).toHaveLength(1);
    expect(edge.fin).toEqual({ tipo: 'arrow', props: { size: 8, color: NEUTRAL_THEME.tokens.border } });
    expect(edge.origen).toBeUndefined();
  });

  it('the text style of a Slot reaches the Node paint', () => {
    const theme: ResolvedTheme = {
      ...NEUTRAL_THEME,
      nodo: { ...NEUTRAL_THEME.nodo, textos: { title: { tipo: 'text', props: { weight: 700, style: 'normal', transform: 'none', color: 'blue' } } } },
    };

    expect(resolvedStyle(theme, { diagrama: 'architecture' }).pintura.nodo.textos.title?.props).toMatchObject({ weight: 700, color: '#2563eb' });
  });
});

describe('Edge Metrics', () => {
  it('only the label counts: strokes, glow and markers do not change the Metrics', () => {
    const decorated = withEdge({ ...GLOW.arista, origen: { tipo: 'dot', props: { size: 12 } }, fin: { tipo: 'via', props: { size: 16 } } });

    expect(metricsOf(decorated, 'architecture')).toEqual(metricsOf(NEUTRAL_THEME, 'architecture'));
    expect(resolvedStyle(decorated, { diagrama: 'architecture' }).metricas).toEqual(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).metricas);
  });

  it('the label changes the reserved box: scale and padding', () => {
    const wide = withEdge({ etiqueta: { tipo: 'label', props: { scale: 1.2, pad: 10, radius: 4 } } });
    const base = labelSize('conecta', metricsOf(NEUTRAL_THEME, 'architecture'));
    const large = labelSize('conecta', metricsOf(wide, 'architecture'));

    expect(metricsOf(wide, 'architecture')).not.toEqual(metricsOf(NEUTRAL_THEME, 'architecture'));
    expect(large.width).toBeGreaterThan(base.width);
    expect(large.height).toBeGreaterThan(base.height);
  });

  it('pad-y grows the label box height and font mono measures it with the mono font', () => {
    const base = labelSize('conecta', metricsOf(NEUTRAL_THEME, 'architecture'));
    const tall = withEdge({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0, 'pad-y': 3, font: 'mono' } } });

    expect(labelSize('conecta', metricsOf(tall, 'architecture')).height).toBe(base.height + 6);
    expect(metricsOf(tall, 'architecture').fuenteDeEtiqueta).toBe(NEUTRAL_THEME.fonts.mono);
    expect(metricsOf(NEUTRAL_THEME, 'architecture').fuenteDeEtiqueta).toBe(NEUTRAL_THEME.fonts.body);
  });

  it('the label fill and border are paint: they do not change the Metrics', () => {
    const painted = withEdge({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0, fill: 'blue', border: 'gray' } } });

    expect(metricsOf(painted, 'architecture')).toEqual(metricsOf(NEUTRAL_THEME, 'architecture'));
  });

  it('a Theme with an invalid Edge does not meet the contract', () => {
    expect(() => resolveTheme(withEdge({ fin: { tipo: 'flecha' as never, props: {} } }))).toThrow(/arista\.fin/);
  });

  it('a hand-written Theme that omits properties with a default receives them from the catalog (corner, cut, radius of a stroke)', () => {
    const minimum = withEdge({ capas: [line('linea', { color: 'blue', width: 2, style: 'solid' })], fin: { tipo: 'arrow', props: {} } });

    const resolved = resolveTheme(minimum);

    expect(resolved.arista.capas[0]?.primitiva.props).toMatchObject({ corner: 'sharp', cut: 6, radius: 8 });
    expect(Object.keys(resolved.arista.fin?.props ?? {}).length).toBeGreaterThan(0);
  });

  it('a marker without color takes the main stroke one (the last of the stack), not the one of the halo below', () => {
    const theme = { ...GLOW, arista: { ...GLOW.arista, fin: { tipo: 'arrow', props: { size: 10 } } } };

    const { fin: end, capas: layers } = resolvedStyle(theme, { diagrama: 'architecture' }).pintura.arista;

    expect(end?.props['color']).toBe(layers[1]?.props['color']);
    expect(end?.props['color']).not.toBe(layers[0]?.props['color']);
  });
});
