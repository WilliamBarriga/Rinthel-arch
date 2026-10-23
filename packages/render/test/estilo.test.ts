import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO } from 'canonico';
import type { Tema } from 'canonico';
import { metricasDe } from 'layout';
import { resolverEstilo } from 'render';

describe('resolverEstilo', () => {
  it('entrega los colores y fuentes del Tema', () => {
    const estilo = resolverEstilo(TEMA_NEUTRO);

    expect(estilo.fondo).toBe('#ffffff');
    expect(estilo.texto).toBe('#1f2937');
    expect(estilo.borde).toBe('#9ca3af');
    expect(estilo.fuenteCuerpo).toBe('sans-serif');
    expect(estilo.fuenteMono).toBe('monospace');
    expect(estilo.paleta['blue']).toBe('#2563eb');
  });

  it('trae los defaults de dibujo en un solo sitio', () => {
    const estilo = resolverEstilo(TEMA_NEUTRO);

    expect(estilo.nodo).toEqual({ radio: 6, relleno: '#ffffff', trazoColapsado: '6 3', porTipo: {} });
    expect(estilo.arista.color).toBe('#9ca3af');
    expect(estilo.arista.flecha).toEqual({ ancho: 8, alto: 8, forma: 'M 0 0 L 10 5 L 0 10 z' });
    expect(estilo.etiqueta.halo).toEqual({ color: '#ffffff', ancho: 3 });
    expect(estilo.glifos).toEqual({ expandido: '-', colapsado: '+' });
  });

  it('lleva las Metricas del Tema (las mismas que mide layout)', () => {
    const tema: Tema = { ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '20px' } };

    expect(resolverEstilo(tema).metricas).toEqual(metricasDe(tema));
  });

  it('un Tema incompleto falla con un mensaje que nombra lo que falta', () => {
    const { border: _borde, ...tokens } = TEMA_NEUTRO.tokens;

    expect(() => resolverEstilo({ ...TEMA_NEUTRO, tokens })).toThrow(/tokens\.border/);
    expect(() => resolverEstilo({ ...TEMA_NEUTRO, fonts: {} })).toThrow(/fonts\.body/);
  });
});
