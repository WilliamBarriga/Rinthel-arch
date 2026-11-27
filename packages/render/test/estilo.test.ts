import { describe, expect, it } from 'vitest';

import type { Theme } from 'canonical';
import { resolverEstilo } from 'render';
import { NEUTRAL_THEME, metricsOf } from 'theme';

describe('resolverEstilo', () => {
  it('entrega los colores y fuentes del Tema', () => {
    const estilo = resolverEstilo(NEUTRAL_THEME, 'architecture');

    expect(estilo.fondo).toBe('#ffffff');
    expect(estilo.texto).toBe('#1f2937');
    expect(estilo.borde).toBe('#9ca3af');
    expect(estilo.fuenteCuerpo).toBe('sans-serif');
    expect(estilo.fuenteMono).toBe('monospace');
    expect(estilo.paleta['blue']).toBe('#2563eb');
  });

  it('el color de error es el token `error` del Tema, con un rojo por defecto, y no depende del estado fantasma', () => {
    const propio = resolverEstilo({ ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, error: '#aa0000' } }, 'architecture');
    const porDefecto = resolverEstilo(NEUTRAL_THEME, 'architecture');

    expect(propio.colorDeError).toBe('#aa0000');
    expect(porDefecto.colorDeError).toBe('#dc2626');
    expect(porDefecto.colorDeError).not.toBe(porDefecto.estados.ghost.color);
  });

  it('trae los defaults de dibujo en un solo sitio', () => {
    const estilo = resolverEstilo(NEUTRAL_THEME, 'architecture');

    expect(estilo.nodo).toEqual({ radio: 6, relleno: '#ffffff', trazoColapsado: '6 3' });
    expect(estilo.pintura.arista.capas[0]?.props['color']).toBe('#9ca3af');
    expect(estilo.pintura.arista.fin).toEqual({ tipo: 'arrow', props: { size: 8, color: '#9ca3af' } });
    expect(estilo.etiqueta.halo).toEqual({ color: '#ffffff', ancho: 3 });
    expect(estilo.glifos).toEqual({ expandido: '-', colapsado: '+' });
  });

  it('lleva las Metricas del Tema (las mismas que mide layout)', () => {
    const tema: Theme = { ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: '20px' } };

    expect(resolverEstilo(tema, 'architecture').metricas).toEqual(metricsOf(tema, 'architecture'));
  });

  it('un Tema incompleto falla con un mensaje que nombra lo que falta', () => {
    const { border: _borde, ...tokens } = NEUTRAL_THEME.tokens;

    expect(() => resolverEstilo({ ...NEUTRAL_THEME, tokens }, 'architecture')).toThrow(/tokens\.border/);
    expect(() => resolverEstilo({ ...NEUTRAL_THEME, fonts: {} }, 'architecture')).toThrow(/fonts\.body/);
  });
});
