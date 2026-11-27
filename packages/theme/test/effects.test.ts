import { describe, expect, it } from 'vitest';

import { CATALOG, NEUTRAL_THEME, buildPrimitive, createPrng, resolvedStyle, fnv1a, layerSpin, layerSeed, resolvedThemeSchema } from 'theme';

describe('deterministic seed', () => {
  it('32-bit FNV-1a matches the known vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('depends on the id and the Layer name, and nothing else', () => {
    expect(layerSeed('api', 'sketch')).toBe(layerSeed('api', 'sketch'));
    expect(layerSeed('api', 'sketch')).not.toBe(layerSeed('api', 'otra'));
    expect(layerSeed('api', 'sketch')).not.toBe(layerSeed('db', 'sketch'));
  });

  it('`seed N` changes the result and is reproducible', () => {
    const base = layerSeed('api', 'sketch');

    expect(layerSeed('api', 'sketch', 7)).toBe(layerSeed('api', 'sketch', 7));
    expect(layerSeed('api', 'sketch', 7)).not.toBe(base);
    expect(layerSeed('api', 'sketch', 8)).not.toBe(layerSeed('api', 'sketch', 7));
  });

  it('the PRNG of a Layer is the same sequence regardless of what else was drawn', () => {
    const a = createPrng(layerSeed('api', 'g'));
    createPrng(layerSeed('db', 'g'))();
    const b = createPrng(layerSeed('api', 'g'));

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });

  it('the rotation never exceeds the Layer cap and is stable', () => {
    const spins = Array.from({ length: 200 }, (_, i) => layerSpin(layerSeed(`n${i}`, 'giro'), 3));

    expect(spins.every((g) => Math.abs(g) <= 3)).toBe(true);
    expect(new Set(spins).size).toBeGreaterThan(50);
    expect(layerSpin(layerSeed('n1', 'giro'), 3)).toBe(spins[1]);
    expect(layerSpin(5, 0)).toBe(0);
  });
});

describe('catalog Effect Families', () => {
  const palette = { azul: '#2563eb' };
  const ok = (kind: string, props: Array<{ key: string; value: string | number }>) => buildPrimitive(kind, props, palette);

  it('covers shadow, glow, glass, filter and decoration, and none affects the Metrics', () => {
    const families = new Set(Object.values(CATALOG).map((p) => p.family));

    for (const f of ['sombra', 'glow', 'vidrio', 'filtro', 'decoracion']) expect(families).toContain(f);
    for (const p of Object.values(CATALOG).filter((d) => ['sombra', 'glow', 'vidrio', 'filtro', 'decoracion'].includes(d.family))) expect(p.affectsMetrics).toBe(false);
  });

  it('the shadow accepts inset, spread and blur 0 (hard shadow)', () => {
    const hard = ok('shadow', [{ key: 'color', value: 'azul' }, { key: 'x', value: 4 }, { key: 'y', value: 4 }, { key: 'inset', value: 1 }, { key: 'spread', value: -2 }]);

    expect(hard.errors).toEqual([]);
    expect(hard.primitive?.props).toMatchObject({ blur: 0, x: 4, y: 4, inset: 1, spread: -2 });
  });

  it('the rotation rejects (without clamping) more than 3 degrees', () => {
    expect(ok('tilt', [{ key: 'degrees', value: 3 }]).errors).toEqual([]);
    expect(ok('tilt', [{ key: 'degrees', value: 4 }]).errors.map((e) => e.code)).toEqual(['theme-invalid-value']);
  });

  it('requires color in glow, shadow and tape, and validates the other Primitives', () => {
    for (const kind of ['glow', 'shadow', 'tape']) expect(ok(kind, []).errors).toHaveLength(1);
    expect(ok('glass', []).primitive).toBeDefined();
    expect(ok('sketch', []).primitive).toBeDefined();
    expect(ok('glass', [{ key: 'blur', value: 999 }]).errors).toHaveLength(1);
  });

  it('the Theme `seed` is a non-negative integer in tokens', () => {
    const withSeed = (seed: string) => resolvedThemeSchema.safeParse({ ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, seed } });

    expect(withSeed('7').success).toBe(true);
    expect(withSeed('-1').success).toBe(false);
    expect(withSeed('1.5').success).toBe(false);
    expect(withSeed('x').success).toBe(false);
  });
});

describe('painted Layers and Metrics', () => {
  it('shadow, glow, glass, hand-drawn and decoration do not change the Metrics and carry the Theme seed', () => {
    const layer = (name: string, kind: string, props: Record<string, string | number>) => ({ nombre: name, primitiva: { tipo: kind, props } });
    const adorned = {
      ...NEUTRAL_THEME,
      tokens: { ...NEUTRAL_THEME.tokens, seed: '9' },
      nodo: {
        ...NEUTRAL_THEME.nodo,
        capas: [layer('s', 'shadow', { color: 'blue', blur: 8 }), layer('g', 'glow', { color: 'blue' }), layer('v', 'glass', {}), layer('m', 'sketch', {}), layer('t', 'tape', { color: 'blue' })],
      },
    };
    const style = resolvedStyle(adorned, { diagrama: 'architecture' });

    expect(style.metricas).toEqual(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).metricas);
    expect(style.pintura.nodo.capas.map((c) => c.tipo)).toEqual(['shadow', 'glow', 'glass', 'sketch', 'tape']);
    expect(style.pintura.semilla).toBe(9);
    expect(resolvedStyle(NEUTRAL_THEME, { diagrama: 'architecture' }).pintura.semilla).toBeUndefined();
  });
});
