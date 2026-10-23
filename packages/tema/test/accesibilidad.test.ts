import { describe, expect, it } from 'vitest';

import { TEMA_ALTO_CONTRASTE, TEMA_NEUTRO, advertenciasDeContraste, leyendaDelTema, razonDeContraste, tiposSoloColor } from 'tema';
import type { TemaResuelto } from 'tema';

const capa = (nombre: string, tipo: string, props: Record<string, string | number>) => ({ nombre, primitiva: { tipo, props } });

const tema = (
  palette: Record<string, string>,
  capas: ReturnType<typeof capa>[],
  extra: Record<string, unknown> = {},
  tokens: Partial<TemaResuelto['tokens']> = {},
): TemaResuelto =>
  ({
    ...TEMA_NEUTRO,
    name: 't',
    palette,
    tokens: { ...TEMA_NEUTRO.tokens, ...tokens },
    nodo: { capas, slots: ['title', 'attrs'], tipos: {}, estados: {}, ...extra },
  }) as TemaResuelto;

describe('razon de contraste (WCAG)', () => {
  it('negro sobre blanco es 21:1 y un color sobre si mismo 1:1', () => {
    expect(razonDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(razonDeContraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('advertencias de contraste', () => {
  it('relleno claro con texto claro avisa 4.5:1 por Tipo, y los Tipos legibles no avisan', () => {
    const t = tema(
      { claro: '#f0f0f0', oscuro: '#111111', borde: '#000000' },
      [capa('relleno', 'solid', { color: 'COLOR' }), capa('borde', 'border', { color: 'borde', width: 2 })],
      {},
      { foreground: '#ffffff' },
    );
    const avisos = advertenciasDeContraste(t, { malo: 'claro', bueno: 'oscuro' });

    expect(avisos.map((a) => [a.tipo, a.estado, a.parte])).toEqual([['malo', 'base', 'texto']]);
    expect(avisos[0]!.mensaje).toMatch(/4\.5:1/);
  });

  it('un borde palido sobre el fondo avisa 3:1 para graficos', () => {
    const t = tema({ palido: '#eeeeee' }, [capa('borde', 'border', { color: 'palido', width: 1 })]);

    expect(advertenciasDeContraste(t, { x: undefined }).map((a) => a.parte)).toEqual(['grafico']);
  });

  it('avisa por estado cuando solo el parche empeora el contraste', () => {
    const t = tema(
      { oscuro: '#111111', claro: '#f5f5f5' },
      [capa('relleno', 'solid', { color: 'oscuro' })],
      { estados: { atenuado: [{ nombre: 'relleno', props: { color: 'claro' } }] } },
      { foreground: '#ffffff' },
    );
    const avisos = advertenciasDeContraste(t, { x: undefined });

    expect(avisos.map((a) => [a.estado, a.parte, a.capa])).toEqual([['atenuado', 'texto', 'relleno']]);
  });

  it('los Temas incorporados neutral y alto-contraste no dan avisos', () => {
    expect(advertenciasDeContraste(TEMA_NEUTRO, { servicio: 'blue' })).toEqual([]);
    expect(advertenciasDeContraste(TEMA_ALTO_CONTRASTE, { servicio: 'blue', db: 'green' })).toEqual([]);
  });
});

describe('solo color', () => {
  const capas = [capa('forma', 'rect', { radius: 4 }), capa('relleno', 'solid', { color: 'COLOR' })];
  const porColor = tema({ a: '#cc0000', b: '#0000cc' }, capas);
  const porForma = tema({ a: '#cc0000', b: '#0000cc' }, capas, { tipos: { db: [{ nombre: 'forma', props: { radius: 30 } }] } });
  const tipos = [
    { name: 'api', color: 'a' },
    { name: 'db', color: 'b' },
  ];

  it('dos Tipos que solo difieren por color de Paleta se emparejan', () => {
    expect(tiposSoloColor(porColor, tipos)).toEqual([['api', 'db']]);
  });

  it('otra forma, otro icono o un Tema que ignora COLOR no son solo color', () => {
    expect(tiposSoloColor(porForma, tipos)).toEqual([]);
    expect(tiposSoloColor(porColor, [{ ...tipos[0]!, icon: 'x' }, { ...tipos[1]!, icon: 'y' }])).toEqual([]);
    const ciego = tema({ a: '#cc0000', b: '#0000cc' }, [capa('relleno', 'solid', { color: 'a' })]);
    expect(tiposSoloColor(ciego, tipos)).toEqual([]);
  });

  it('la leyenda lista Tipo, forma y color, y se pide sola solo cuando hay solo color', () => {
    expect(leyendaDelTema(porColor, tipos)).toEqual({
      necesaria: true,
      entradas: [
        { tipo: 'api', forma: 'rect', color: '#cc0000' },
        { tipo: 'db', forma: 'rect', color: '#0000cc' },
      ],
    });
    expect(leyendaDelTema(porForma, tipos).necesaria).toBe(false);
  });
});
