import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';

import { estadosDeRuta, moverFoco, ordenDeFoco, rutaMasCorta, unirEstados } from '../src/ruta-y-foco';

const nodo = (id: string, children: unknown[] = []) => ({ id, type: 'servicio', title: id, description: '', children });
const arista = (from: string, to: string) => ({ from: { node: from }, to: { node: to } });

/** g { g.x } ; a -> b -> c ; a -> d ; e (aislado) */
const vista = resolveView(
  fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [nodo('g', [nodo('g.x')]), nodo('a'), nodo('b'), nodo('c'), nodo('d'), nodo('e')],
      edges: [arista('a', 'b'), arista('b', 'c'), arista('a', 'd')],
    },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  }),
  'v',
)!;

describe('foco de teclado', () => {
  it('Nodos y Grupos se recorren en orden del Modelo y se sale por los extremos', () => {
    expect(ordenDeFoco(vista)).toEqual(['g', 'g.x', 'a', 'b', 'c', 'd', 'e']);
    expect(moverFoco(vista, undefined, 'siguiente')).toBe('g');
    expect(moverFoco(vista, 'g', 'siguiente')).toBe('g.x');
    expect(moverFoco(vista, 'e', 'siguiente')).toBeUndefined();
    expect(moverFoco(vista, 'g', 'anterior')).toBeUndefined();
    expect(moverFoco(vista, 'b', 'anterior')).toBe('a');
  });

  it('las flechas saltan por Aristas al vecino y, sin vecino, el foco no cambia', () => {
    expect(moverFoco(vista, 'a', 'adelante')).toBe('b');
    expect(moverFoco(vista, 'c', 'atras')).toBe('b');
    expect(moverFoco(vista, 'b', 'atras')).toBe('a');
    expect(moverFoco(vista, 'e', 'adelante')).toBe('e');
    expect(moverFoco(vista, 'c', 'adelante')).toBe('c');
  });
});

describe('ruta', () => {
  it('la ruta mas corta sigue la direccion de las Aristas y, sin camino dirigido, la ignora', () => {
    expect(rutaMasCorta(vista, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(rutaMasCorta(vista, 'c', 'a')).toEqual(['c', 'b', 'a']);
    expect(rutaMasCorta(vista, 'd', 'c')).toEqual(['d', 'a', 'b', 'c']);
    expect(rutaMasCorta(vista, 'a', 'e')).toBeUndefined();
  });

  it('resaltar una ruta pone en-ruta lo que la compone y atenua el resto', () => {
    const estados = estadosDeRuta(vista, ['a', 'b', 'c']);

    expect(estados['a']).toEqual(['en-ruta']);
    expect(estados['c']).toEqual(['en-ruta']);
    expect(estados['a -> b']).toEqual(['en-ruta']);
    expect(estados['b -> c']).toEqual(['en-ruta']);
    expect(estados['a -> d']).toEqual(['atenuado']);
    for (const id of ['g', 'g.x', 'd', 'e']) expect(estados[id]).toEqual(['atenuado']);
  });

  it('sin ruta no se atenua nada', () => {
    expect(estadosDeRuta(vista, [])).toEqual({});
  });

  it('unirEstados concatena los de cada id', () => {
    expect(unirEstados({ a: ['seleccionado'] }, { a: ['en-ruta'], b: ['foco'] })).toEqual({ a: ['seleccionado', 'en-ruta'], b: ['foco'] });
  });
});
