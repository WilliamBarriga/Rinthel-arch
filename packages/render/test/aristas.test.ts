import { describe, expect, it } from 'vitest';

import { resolverEstilo } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import type { Elemento } from '../src/elemento';
import { pintarArista, pintarEtiquetaDeArista } from '../src/pintores';

const linea = (nombre: string, props: Record<string, string | number>) => ({ nombre, primitiva: { tipo: 'line', props: { width: 2, style: 'solid', corner: 'sharp', cut: 6, radius: 8, ...props } } });
const tema = (arista: Partial<TemaResuelto['arista']>): TemaResuelto => ({ ...TEMA_NEUTRO, arista: { ...TEMA_NEUTRO.arista, ...arista } });
const todos = (e: Elemento | string, tag: string): Elemento[] =>
  typeof e === 'string' ? [] : [...(e.tag === tag ? [e] : []), ...(e.hijos ?? []).flatMap((h) => todos(h, tag))];

const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }];

describe('Aristas del Tema', () => {
  it('la pila de trazos se dibuja de abajo hacia arriba: el glow ancho y translucido va bajo el principal', () => {
    const estilo = resolverEstilo(tema({ capas: [linea('glow', { color: 'ORIGEN/0.3', width: 8 }), linea('principal', { color: 'ORIGEN' })] }));
    const rutas = todos(pintarArista(estilo, { id: 'a -> b', puntos: L, origen: 'blue' }), 'path').filter((p) => p.attrs['data-capa'] !== undefined);

    expect(rutas.map((r) => r.attrs['data-capa'])).toEqual(['glow', 'principal']);
    expect(rutas[0]?.attrs).toMatchObject({ stroke: 'rgba(37, 99, 235, 0.3)', 'stroke-width': '8' });
    expect(rutas[1]?.attrs).toMatchObject({ stroke: '#2563eb', 'stroke-width': '2' });
  });

  it('cada estilo de trazo tiene su dibujo y la esquina chaflan corta la ruta', () => {
    const dibujo = (props: Record<string, string | number>) =>
      todos(pintarArista(resolverEstilo(tema({ capas: [linea('l', { color: 'blue', ...props })] })), { id: 'e', puntos: L }), 'path')[0]!.attrs;

    expect(dibujo({ style: 'dashed' })['stroke-dasharray']).toBe('8 4');
    expect(dibujo({ style: 'dotted' })).toMatchObject({ 'stroke-dasharray': '0 4', 'stroke-linecap': 'round' });
    expect(dibujo({ style: 'pixel' })).toMatchObject({ 'stroke-dasharray': '2 2', 'shape-rendering': 'crispEdges' });
    expect(dibujo({})['d']).toBe('M 0 0 L 40 0 L 40 40');
    expect(dibujo({ corner: 'chamfer', cut: 6 })['d']).toBe('M 0 0 L 34 0 L 40 6 L 40 40');
  });

  it('la esquina round curva cada giro con un radio limitado a la mitad del segmento', () => {
    const dibujo = (props: Record<string, string | number>) =>
      todos(pintarArista(resolverEstilo(tema({ capas: [linea('l', { color: 'blue', ...props })] })), { id: 'e', puntos: L }), 'path')[0]!.attrs['d'];

    expect(dibujo({ corner: 'round', radius: 10 })).toBe('M 0 0 L 30 0 Q 40 0 40 10 L 40 40');
    expect(dibujo({ corner: 'round', radius: 60 })).toBe('M 0 0 L 20 0 Q 40 0 40 20 L 40 40');
  });

  it('el marcador square es un cuadrado relleno detras de la punta', () => {
    const estilo = resolverEstilo(tema({ capas: [linea('l', { color: 'blue' })], origen: { tipo: 'square', props: { size: 6 } } }));
    const marca = todos(pintarArista(estilo, { id: 'e', puntos: L }), 'g').find((g) => g.attrs['data-marker'] === 'origen');

    expect(marca?.hijos?.[0]).toMatchObject({ tag: 'rect', attrs: { x: '-6', y: '-3', width: '6', height: '6', fill: '#2563eb' } });
  });

  it('los marcadores de origen y fin se giran hacia la ruta', () => {
    const estilo = resolverEstilo(tema({ capas: [linea('l', { color: 'blue' })], origen: { tipo: 'dot', props: { size: 6 } }, fin: { tipo: 'via', props: { size: 8 } } }));
    const marcas = todos(pintarArista(estilo, { id: 'e', puntos: L }), 'g').filter((g) => g.attrs['data-marker'] !== undefined);

    expect(marcas.map((m) => m.attrs['data-marker'])).toEqual(['origen', 'fin']);
    expect(marcas[0]?.attrs['transform']).toBe('translate(0 0) rotate(180)');
    expect(marcas[1]?.attrs['transform']).toBe('translate(40 40) rotate(90)');
    expect(marcas[0]?.hijos?.[0]).toMatchObject({ tag: 'circle', attrs: { r: '3', fill: '#2563eb' } });
    expect(marcas[1]?.hijos?.[0]).toMatchObject({ tag: 'circle', attrs: { r: '4', fill: TEMA_NEUTRO.tokens.background, stroke: '#2563eb' } });
  });

  it('la etiqueta con fill dibuja su caja con el radio del Tema; sin fill solo lleva halo', () => {
    const caja = { x: 10, y: 10, width: 50, height: 16 };
    const conCaja = resolverEstilo(tema({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 5, fill: 'blue' } } }));
    const sinCaja = resolverEstilo(TEMA_NEUTRO);
    const a = pintarEtiquetaDeArista(conCaja, { id: 'e', texto: 'x', puntos: L, caja });
    const b = pintarEtiquetaDeArista(sinCaja, { id: 'e', texto: 'x', puntos: L, caja });

    expect(todos(a, 'rect')[0]?.attrs).toMatchObject({ x: '10', width: '50', rx: '5', fill: '#2563eb' });
    expect(todos(a, 'text')[0]?.attrs['stroke']).toBeUndefined();
    expect(todos(b, 'rect')).toEqual([]);
    expect(todos(b, 'text')[0]?.attrs['paint-order']).toBe('stroke');
  });
});
