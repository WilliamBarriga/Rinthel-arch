import { describe, expect, it } from 'vitest';

import { buildEffect, buildKeyframes, buildMotion, buildTransition, durationMs } from 'theme';

const p = (key: string, value: string | number) => ({ clave: key, valor: value });

describe('animation catalog', () => {
  it('a Motion fills the catalog defaults and is static with reduced-motion', () => {
    expect(buildMotion('pulse', [p('duration', 1200)]).animacion).toEqual({
      clase: 'movimiento',
      movimiento: 'pulse',
      duracionMs: 1200,
      easing: 'ease-in-out',
      intensidad: 0.5,
      retardoMs: 0,
      reducido: 'still',
    });
    expect(buildMotion('spin', []).animacion).toMatchObject({ easing: 'linear', duracionMs: 2000 });
  });

  it('rejects without clamping and returns all errors at once', () => {
    const { animacion: animation, errores: errors } = buildMotion('pulse', [p('intensity', '2'), p('easing', 'rebote'), p('duration', 0)]);

    expect(animation).toBeUndefined();
    expect(errors.map((e) => [e.codigo, e.clave])).toEqual([
      ['theme-invalid-value', 'intensity'],
      ['theme-invalid-value', 'easing'],
      ['theme-invalid-value', 'duration'],
    ]);
  });

  it('an unknown Motion suggests the candidate; spin and stream do not accept intensity', () => {
    expect(buildMotion('pulsso', []).errores[0]).toMatchObject({ codigo: 'theme-unknown-motion', hint: "did you mean 'pulse'" });
    expect(buildMotion('spin', [p('intensity', '0.3')]).errores[0]).toMatchObject({ codigo: 'theme-unknown-property', clave: 'intensity' });
  });

  it('reduced in a Motion only accepts still; in transitions and Effects, fade or instant', () => {
    expect(buildMotion('pulse', [p('reduced', 'fade')]).errores[0]).toMatchObject({ codigo: 'theme-invalid-value', clave: 'reduced' });
    expect(buildTransition([p('duration', 120), p('reduced', 'instant')]).animacion).toEqual({ duracionMs: 120, easing: 'ease', reducido: 'instant' });
    expect(buildTransition([p('reduced', 'still')]).errores[0]).toMatchObject({ clave: 'reduced' });
    expect(buildEffect('zoom', []).animacion).toEqual({ efecto: 'zoom', duracionMs: 300, easing: 'ease-out', retardoMs: 0, reducido: 'fade' });
    expect(buildEffect('girar', []).errores[0]).toMatchObject({ codigo: 'theme-unknown-motion' });
  });

  it('keyframes: only painted or composable properties, increasing steps within range', () => {
    const ok = buildKeyframes('opacity', [p('duration', 2000)], [{ en: 0, valor: 1 }, { en: 50, valor: 0.4 }, { en: 100, valor: 1 }]);
    expect(ok.animacion).toMatchObject({ clase: 'keyframes', propiedad: 'opacity', duracionMs: 2000, reducido: 'still' });

    expect(buildKeyframes('width', [], [{ en: 0, valor: 1 }, { en: 100, valor: 2 }]).errores[0]).toMatchObject({ codigo: 'theme-unknown-motion' });
    expect(buildKeyframes('opacity', [], [{ en: 0, valor: 1 }]).errores[0]).toMatchObject({ codigo: 'theme-invalid-value' });
    expect(buildKeyframes('opacity', [], [{ en: 50, valor: 1 }, { en: 20, valor: 0 }]).errores[0]).toMatchObject({ codigo: 'theme-invalid-value' });
    expect(buildKeyframes('opacity', [], [{ en: 0, valor: 3 }, { en: 100, valor: 0 }]).errores[0]).toMatchObject({ codigo: 'theme-invalid-value' });
  });

  it('durationMs understands ms and s', () => {
    expect(durationMs('120', 'ms')).toBe(120);
    expect(durationMs('1.2', 's')).toBe(1200);
    expect(durationMs('2', 'min')).toBeUndefined();
  });
});
