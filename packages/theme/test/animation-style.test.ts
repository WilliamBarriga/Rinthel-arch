import { describe, expect, it } from 'vitest';

import { NEUTRAL_THEME, buildMotion, resolvedStyle, resolvedThemeSchema } from 'theme';

const p = (key: string, value: string | number) => ({ key, value });

describe('animation in the Resolved style', () => {
  const pulse = buildMotion('pulse', [p('duration', 1200)]).animacion!;
  const aura = buildMotion('aura', []).animacion!;
  const withAnimation = {
    ...NEUTRAL_THEME,
    palette: { blue: '#00f' },
    nodo: {
      capas: [
        { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 4 } } },
        { nombre: 'acento', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } }, animacion: pulse },
      ],
      slots: NEUTRAL_THEME.nodo.slots,
      tipos: {},
      estados: { selected: [{ nombre: 'acento', props: {}, animacion: aura }], hover: [{ nombre: 'acento', props: {}, animacion: null }] },
      animacion: { transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' }, escalonadoMs: 60 },
    },
  };
  const withoutAnimation = {
    ...withAnimation,
    nodo: {
      capas: withAnimation.nodo.capas.map(({ animacion: _a, ...layer }) => layer),
      slots: withAnimation.nodo.slots,
      tipos: {},
      estados: { selected: [{ nombre: 'acento', props: {} }] },
    },
  };

  it('the paint carries the Motion of the Layer and of each state (the patch changes or removes it)', () => {
    const { pintura: paint } = resolvedStyle(withAnimation, { diagrama: 'architecture' });

    expect(paint.nodo.capas.find((c) => c.nombre === 'acento')?.animacion).toEqual(pulse);
    expect(paint.nodo.estados.selected?.find((c) => c.nombre === 'acento')?.animacion).toEqual(aura);
    expect(paint.nodo.estados.hover?.find((c) => c.nombre === 'acento')?.animacion).toBeUndefined();
    expect(paint.nodo.animacion).toEqual({ transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' }, escalonadoMs: 60 });
  });

  it('nothing animated affects the Metrics: equal with and without animation', () => {
    expect(resolvedStyle(withAnimation, { diagrama: 'architecture' }).metricas).toEqual(resolvedStyle(withoutAnimation, { diagrama: 'architecture' }).metricas);
  });

  it('the schema rejects a Motion outside the catalog or with an invalid range', () => {
    const bad = (animation: unknown) => ({ ...withAnimation, nodo: { ...withAnimation.nodo, capas: [{ nombre: 'f', primitiva: { tipo: 'rect', props: {} }, animacion: animation }] } });

    expect(resolvedThemeSchema.safeParse(withAnimation).success).toBe(true);
    expect(resolvedThemeSchema.safeParse(bad({ ...pulse, movimiento: 'salto' })).success).toBe(false);
    expect(resolvedThemeSchema.safeParse(bad({ ...pulse, intensidad: 3 })).success).toBe(false);
  });
});
