import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO } from 'canonico';
import type { NodoResuelto } from 'canonico';
import { resolverEstilo } from 'render';

import type { Elemento } from '../src/elemento';
import { pintarArista, pintarControl, pintarEtiquetaDeArista, pintarFlecha, pintarFondo, pintarGrupo, pintarNodo } from '../src/pintores';

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
const envolver = (hijos: Elemento[]): Elemento => ({ tag: 'g', attrs: {}, hijos });

describe('pintores por parte', () => {
  it('el fondo toma el color del Estilo', () => {
    expect(pintarFondo(estilo, 300, 200).attrs['fill']).toBe(estilo.fondo);
    expect(pintarFondo({ ...estilo, fondo: 'tomato' }, 300, 200).attrs['fill']).toBe('tomato');
  });

  it('el Nodo usa radio, relleno y trazo del Estilo; colapsado lleva trazo discontinuo', () => {
    const cuerpo = (n: Partial<NodoResuelto>, e = estilo) => pintarNodo(e, { nodo: conNodo(n), caja, trazo: 'red', texto: 'N', conAtributos: false });
    const rect = cuerpo({})[0]!;

    expect(rect.attrs).toMatchObject({ rx: '6', fill: estilo.nodo.relleno, stroke: 'red' });
    expect(rect.attrs['stroke-dasharray']).toBeUndefined();
    expect(cuerpo({ collapsed: true })[0]!.attrs['stroke-dasharray']).toBe(estilo.nodo.trazoColapsado);
    expect(cuerpo({}, { ...estilo, nodo: { ...estilo.nodo, radio: 12 } })[0]!.attrs['rx']).toBe('12');
  });

  it('el Grupo pone el titulo arriba a la izquierda, en la linea base de las Metricas', () => {
    const texto = buscar(envolver(pintarGrupo(estilo, { nodo: conNodo({}), caja, trazo: 'red', texto: 'G' })), 'text')!;

    expect(texto.attrs).toMatchObject({ x: String(estilo.metricas.margenDeTexto), y: String(estilo.metricas.baseDeTitulo), fill: estilo.texto });
  });

  it('el control muestra el glifo del Estilo segun el estado', () => {
    const glifo = (collapsed: boolean, e = estilo) => buscar(pintarControl(e, { nodo: conNodo({ collapsed }), caja, alClic: () => {} }), 'text')!.hijos![0];

    expect(glifo(false)).toBe('-');
    expect(glifo(true)).toBe('+');
    expect(glifo(true, { ...estilo, glifos: { expandido: 'v', colapsado: '>' } })).toBe('>');
  });

  it('la Arista usa el color y la flecha del Estilo', () => {
    const g = pintarArista(estilo, { id: 'a -> b', puntos: [{ x: 0, y: 0 }, { x: 50, y: 0 }] });
    const ruta = buscar(g, 'path')!;

    expect(ruta.attrs['stroke']).toBe(estilo.arista.color);
    expect(ruta.attrs['marker-end']).toMatch(/^url\(#flecha-/);
    expect(buscar(pintarFlecha(estilo), 'marker')!.attrs).toMatchObject({ markerWidth: '8', markerHeight: '8' });
  });

  it('la etiqueta de Arista lleva el halo del Estilo', () => {
    const texto = pintarEtiquetaDeArista(estilo, { id: 'e', texto: 'x', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], caja: undefined });

    expect(texto.attrs).toMatchObject({ stroke: estilo.etiqueta.halo.color, 'stroke-width': '3', 'paint-order': 'stroke' });
    expect(pintarEtiquetaDeArista({ ...estilo, etiqueta: { ...estilo.etiqueta, halo: { color: 'black', ancho: 5 } } }, { id: 'e', texto: 'x', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], caja: undefined }).attrs).toMatchObject({ stroke: 'black', 'stroke-width': '5' });
  });
});
