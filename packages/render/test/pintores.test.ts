import { describe, expect, it } from 'vitest';

import type { NodoResuelto } from 'canonico';
import { resolverEstilo } from 'render';

import type { Elemento } from '../src/elemento';
import { pintarArista, pintarControl, pintarEstadoDeCaja, pintarEtiquetaDeArista, pintarGrupo, pintarNodo } from '../src/pintores';
import { TEMA_NEUTRO, colocarEnCaja } from 'tema';

const estilo = resolverEstilo(TEMA_NEUTRO);
const caja = { x: 0, y: 0, width: 140, height: 60 };
const nodoBase = { id: 'n', label: 'N', collapsed: false, children: [], attributes: [], childCount: 0 } as unknown as NodoResuelto;
const conNodo = (parcial: Partial<NodoResuelto>): NodoResuelto => ({ ...nodoBase, ...parcial });

const buscar = (e: Elemento | string, tag: string): Elemento | undefined => {
  if (typeof e === 'string') return undefined;
  if (e.tag === tag) return e;
  for (const h of e.hijos ?? []) {
    const r = buscar(h, tag);
    if (r !== undefined) return r;
  }
  return undefined;
};


describe('pintores por parte', () => {
  it('el Nodo pone su titulo en el rectangulo del Slot y las filas de Atributos en el suyo', () => {
    const atributos = [{ name: 'id', type: 'uuid', notes: '' }];
    const datos = { nodo: conNodo({ attributes: atributos }), caja, trazo: 'red', texto: 'N', conAtributos: true };
    const [titulo, ...resto] = pintarNodo(estilo, datos);
    const { slots } = colocarEnCaja(estilo.metricas, 1, caja.width);

    expect(titulo!.attrs['data-slot']).toBe('title');
    expect(titulo!.attrs['style']).toContain(`top:${slots.title!.y}px;width:${slots.title!.width}px;height:${slots.title!.height}px`);
    expect(resto[0]!.attrs['data-slot']).toBe('attrs');
    expect(JSON.stringify(resto)).toContain('id: uuid');
  });

  it('sin conAtributos el Nodo no dibuja el Slot attrs', () => {
    const elementos = pintarNodo(estilo, { nodo: conNodo({ attributes: [{ name: 'id', type: 'uuid', notes: '' }] }), caja, trazo: 'red', texto: 'N', conAtributos: false });

    expect(elementos.map((e) => e.attrs['data-slot'])).toEqual(['title']);
  });

  it('el Grupo pone el titulo arriba a la izquierda, con el margen de las Metricas', () => {
    const [titulo] = pintarGrupo(estilo, { nodo: conNodo({}), caja, trazo: 'red', texto: 'G' });

    expect(titulo!.attrs['class']).toContain('rd-encabezado');
    expect(titulo!.attrs['style']).toContain(`left:${estilo.metricas.margenDeTexto}px;top:0px`);
  });

  it('el control muestra el glifo del Estilo segun el estado', () => {
    const glifo = (collapsed: boolean, e = estilo) => pintarControl(e, { nodo: conNodo({ collapsed }), caja, alClic: () => {} }).hijos![0];

    expect(glifo(false)).toBe('-');
    expect(glifo(true)).toBe('+');
    expect(glifo(true, { ...estilo, glifos: { expandido: 'v', colapsado: '>' } })).toBe('>');
  });

  it('el contorno de estado es una marca sin estilo propio: lo da la hoja', () => {
    const marca = pintarEstadoDeCaja('seleccionado', 'n');

    expect(marca.attrs).toEqual({ class: 'rd-estado', 'data-state': 'seleccionado', 'data-selected': 'n' });
    expect(pintarEstadoDeCaja('hover', 'n').attrs['data-selected']).toBeUndefined();
  });

  it('la Arista usa el trazo y la flecha de la pintura del Estilo', () => {
    const g = pintarArista(estilo, { id: 'a -> b', puntos: [{ x: 0, y: 0 }, { x: 50, y: 0 }] });
    const ruta = buscar(g, 'path')!;

    expect(ruta.attrs['stroke']).toBe('#9ca3af');
    expect(JSON.stringify(g)).toContain('"data-marker":"fin"');
  });

  it('la etiqueta de Arista lleva el halo del Estilo', () => {
    const texto = pintarEtiquetaDeArista(estilo, { id: 'e', texto: 'x', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], caja: undefined });

    expect(texto.attrs).toMatchObject({ stroke: estilo.etiqueta.halo.color, 'stroke-width': '3', 'paint-order': 'stroke' });
    expect(pintarEtiquetaDeArista({ ...estilo, etiqueta: { ...estilo.etiqueta, halo: { color: 'black', ancho: 5 } } }, { id: 'e', texto: 'x', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], caja: undefined }).attrs).toMatchObject({ stroke: 'black', 'stroke-width': '5' });
  });
});
