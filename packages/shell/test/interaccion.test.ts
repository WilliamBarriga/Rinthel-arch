// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, fuenteCanonicaSchema, idDeArista, resolveView } from 'canonico';
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { alturasDeNodo } from 'layout';

import { SELECCION_VACIA, cajaDeElemento, elementoBajo, seleccionar } from '../src/interaccion';

const nodo = (id: string, extra: object = {}) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [], ...extra });

/** g (grupo) con hijo h (con Atributos), fuera p; arista g.h -> p con etiqueta. */
const fuente = fuenteCanonicaSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [
      nodo('g', { children: [nodo('g.h', { attributes: [{ name: 'id', type: 'uuid' }, { name: 'nombre', type: 'text' }] })] }),
      nodo('p'),
    ],
    edges: [{ from: { node: 'g.h' }, to: { node: 'p' }, label: 'usa' }],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const vista = resolveView(fuente, 'v', { expanded: ['g'] }) as VistaResuelta;
const arista = vista.edges[0]!;
const idArista = idDeArista(arista);
const { cabecera, fila } = alturasDeNodo(TEMA_NEUTRO);

/** g en (100,100) 300x200; h dentro de g en (20,40) 200x{cabecera+2 filas}; p en (1000,100). */
const geometria: Geometria = {
  nodes: {
    g: { x: 100, y: 100, width: 300, height: 200 },
    'g.h': { x: 20, y: 40, width: 200, height: cabecera + 2 * fila },
    p: { x: 1000, y: 100, width: 100, height: 50 },
  },
  edges: { [idArista]: { points: [{ x: 320, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 125 }, { x: 1000, y: 125 }] } },
  labels: { [idArista]: { x: 480, y: 170, width: 60, height: 20 } },
  pinsSolapados: [],
  width: 1200,
  height: 400,
};
const bajo = (x: number, y: number, tolerancia?: number) =>
  elementoBajo(vista, geometria, TEMA_NEUTRO, { x, y }, tolerancia === undefined ? {} : { tolerancia });

describe('elementoBajo', () => {
  it('devuelve el Nodo hoja, no el Grupo que lo contiene', () => {
    expect(bajo(130, 150)).toEqual({ tipo: 'nodo', id: 'g.h' });
  });

  it('devuelve el Grupo en su area propia', () => {
    expect(bajo(110, 280)).toEqual({ tipo: 'nodo', id: 'g' });
  });

  it('devuelve el Atributo cuya fila cae bajo el punto', () => {
    const yFila = 100 + 40 + cabecera;
    expect(bajo(130, yFila + 1)).toEqual({ tipo: 'atributo', id: 'g.h#id' });
    expect(bajo(130, yFila + fila + 1)).toEqual({ tipo: 'atributo', id: 'g.h#nombre' });
  });

  it('la cabecera de un Nodo con Atributos es el Nodo', () => {
    expect(bajo(130, 100 + 40 + 2)).toEqual({ tipo: 'nodo', id: 'g.h' });
  });

  it('devuelve la Arista cuando el punto esta en su ruta, dentro de la tolerancia', () => {
    expect(bajo(700, 160)).toEqual({ tipo: 'arista', id: idArista });
    expect(bajo(702, 160, 4)).toEqual({ tipo: 'arista', id: idArista });
    expect(bajo(720, 160, 4)).toBeUndefined();
  });

  it('la etiqueta tiene prioridad sobre la Arista y sobre el Nodo', () => {
    expect(bajo(510, 180)).toEqual({ tipo: 'etiqueta', id: idArista });
  });

  it('la Arista queda por encima del Nodo que cruza', () => {
    expect(bajo(330, 200)).toEqual({ tipo: 'arista', id: idArista });
  });

  it('un punto vacio no devuelve nada', () => {
    expect(bajo(50, 50)).toBeUndefined();
    expect(bajo(5000, 5000)).toBeUndefined();
  });

  it('encuentra elementos lejos de cualquier viewport (sin culling)', () => {
    expect(bajo(1050, 120)).toEqual({ tipo: 'nodo', id: 'p' });
  });

  it('puede ignorar los Atributos cuando no se dibujan', () => {
    const r = elementoBajo(vista, geometria, TEMA_NEUTRO, { x: 130, y: 100 + 40 + cabecera + 1 }, { atributos: false });
    expect(r).toEqual({ tipo: 'nodo', id: 'g.h' });
  });
});

describe('cajaDeElemento', () => {
  it('da la caja en el lienzo de cada tipo de elemento', () => {
    const caja = (el: Parameters<typeof cajaDeElemento>[3]) => cajaDeElemento(vista, geometria, TEMA_NEUTRO, el);
    expect(caja({ tipo: 'nodo', id: 'g.h' })).toEqual({ x: 120, y: 140, width: 200, height: cabecera + 2 * fila });
    expect(caja({ tipo: 'atributo', id: 'g.h#nombre' })).toEqual({ x: 120, y: 140 + cabecera + fila, width: 200, height: fila });
    expect(caja({ tipo: 'arista', id: idArista })).toEqual({ x: 320, y: 125, width: 680, height: 75 });
    expect(caja({ tipo: 'etiqueta', id: idArista })).toEqual({ x: 480, y: 170, width: 60, height: 20 });
    expect(caja({ tipo: 'nodo', id: 'no-existe' })).toBeUndefined();
  });
});

describe('Seleccion', () => {
  const a = { tipo: 'nodo', id: 'a' } as const;
  const b = { tipo: 'arista', id: 'b' } as const;

  it('reemplazar deja solo el elemento', () => {
    expect(seleccionar(seleccionar(SELECCION_VACIA, a, 'reemplazar'), b, 'reemplazar')).toEqual([b]);
  });

  it('agregar suma y no duplica', () => {
    const dos = seleccionar(seleccionar(SELECCION_VACIA, a, 'agregar'), b, 'agregar');
    expect(dos).toEqual([a, b]);
    expect(seleccionar(dos, a, 'agregar')).toEqual([a, b]);
  });

  it('quitar saca solo ese elemento; el mismo id con otro tipo es otro elemento', () => {
    expect(seleccionar([a, b], a, 'quitar')).toEqual([b]);
    expect(seleccionar([a], { tipo: 'etiqueta', id: 'a' }, 'quitar')).toEqual([a]);
  });

  it('alternar agrega o quita', () => {
    expect(seleccionar([a], b, 'alternar')).toEqual([a, b]);
    expect(seleccionar([a, b], a, 'alternar')).toEqual([b]);
  });

  it('no muta la Seleccion de entrada', () => {
    const entrada = [a] as const;
    seleccionar(entrada, b, 'agregar');
    expect(entrada).toEqual([a]);
  });
});
