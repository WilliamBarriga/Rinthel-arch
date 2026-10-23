import { describe, expect, it } from 'vitest';

import { construirEfecto, construirKeyframes, construirMovimiento, construirTransicion, duracionEnMs } from 'tema';

const p = (clave: string, valor: string | number) => ({ clave, valor });

describe('catalogo de animacion', () => {
  it('un Movimiento rellena los defectos del catalogo y es estatico con reduced-motion', () => {
    expect(construirMovimiento('pulso', [p('duration', 1200)]).animacion).toEqual({
      clase: 'movimiento',
      movimiento: 'pulso',
      duracionMs: 1200,
      easing: 'ease-in-out',
      intensidad: 0.5,
      retardoMs: 0,
      reducido: 'still',
    });
    expect(construirMovimiento('giro', []).animacion).toMatchObject({ easing: 'linear', duracionMs: 2000 });
  });

  it('rechaza sin recortar y devuelve todos los errores a la vez', () => {
    const { animacion, errores } = construirMovimiento('pulso', [p('intensity', '2'), p('easing', 'rebote'), p('duration', 0)]);

    expect(animacion).toBeUndefined();
    expect(errores.map((e) => [e.codigo, e.clave])).toEqual([
      ['E_THEME_INVALID_VALUE', 'intensity'],
      ['E_THEME_INVALID_VALUE', 'easing'],
      ['E_THEME_INVALID_VALUE', 'duration'],
    ]);
  });

  it('un Movimiento desconocido sugiere el candidato; giro y flujo no admiten intensidad', () => {
    expect(construirMovimiento('pulsso', []).errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_MOTION', hint: "quisiste decir 'pulso'" });
    expect(construirMovimiento('giro', [p('intensity', '0.3')]).errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_PROPERTY', clave: 'intensity' });
  });

  it('reduced en un Movimiento solo admite still; en transiciones y efectos, fade o instant', () => {
    expect(construirMovimiento('pulso', [p('reduced', 'fade')]).errores[0]).toMatchObject({ codigo: 'E_THEME_INVALID_VALUE', clave: 'reduced' });
    expect(construirTransicion([p('duration', 120), p('reduced', 'instant')]).animacion).toEqual({ duracionMs: 120, easing: 'ease', reducido: 'instant' });
    expect(construirTransicion([p('reduced', 'still')]).errores[0]).toMatchObject({ clave: 'reduced' });
    expect(construirEfecto('escala', []).animacion).toEqual({ efecto: 'escala', duracionMs: 300, easing: 'ease-out', retardoMs: 0, reducido: 'fade' });
    expect(construirEfecto('girar', []).errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_MOTION' });
  });

  it('keyframes: solo propiedades pintadas o componibles, pasos crecientes y en rango', () => {
    const ok = construirKeyframes('opacity', [p('duration', 2000)], [{ en: 0, valor: 1 }, { en: 50, valor: 0.4 }, { en: 100, valor: 1 }]);
    expect(ok.animacion).toMatchObject({ clase: 'keyframes', propiedad: 'opacity', duracionMs: 2000, reducido: 'still' });

    expect(construirKeyframes('width', [], [{ en: 0, valor: 1 }, { en: 100, valor: 2 }]).errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_MOTION' });
    expect(construirKeyframes('opacity', [], [{ en: 0, valor: 1 }]).errores[0]).toMatchObject({ codigo: 'E_THEME_INVALID_VALUE' });
    expect(construirKeyframes('opacity', [], [{ en: 50, valor: 1 }, { en: 20, valor: 0 }]).errores[0]).toMatchObject({ codigo: 'E_THEME_INVALID_VALUE' });
    expect(construirKeyframes('opacity', [], [{ en: 0, valor: 3 }, { en: 100, valor: 0 }]).errores[0]).toMatchObject({ codigo: 'E_THEME_INVALID_VALUE' });
  });

  it('duracionEnMs entiende ms y s', () => {
    expect(duracionEnMs('120', 'ms')).toBe(120);
    expect(duracionEnMs('1.2', 's')).toBe(1200);
    expect(duracionEnMs('2', 'min')).toBeUndefined();
  });
});
