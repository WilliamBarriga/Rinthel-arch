import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';

const nodo = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop(),
  description: '',
  children,
});

/** a { a1 { a1x } a2 }, b { b1 }, c */
function fuente(vista: Record<string, unknown>) {
  return fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: {
      nodes: [
        nodo('a', [nodo('a.a1', [nodo('a.a1.a1x')]), nodo('a.a2')]),
        nodo('b', [nodo('b.b1')]),
        nodo('c'),
      ],
      edges: [
        { from: { node: 'a.a1' }, to: { node: 'b.b1' } },
        { from: { node: 'a.a2' }, to: { node: 'c' } },
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: [], exclude: [], ...vista }],
  });
}

function visibles(vista: Record<string, unknown>): string[] {
  return (resolveView(fuente(vista), 'v')?.nodes ?? []).map((n) => n.id);
}

describe('resolveView', () => {
  it('un id sin sufijo selecciona solo ese Nodo', () => {
    expect(visibles({ include: ['a', 'c'] })).toEqual(['a', 'c']);
  });

  it('`x.*` selecciona los hijos directos y `x.**` todos los descendientes', () => {
    expect(visibles({ include: ['a.*'] })).toEqual(['a.a1', 'a.a2']);
    expect(visibles({ include: ['a.**'] })).toEqual(['a.a1', 'a.a1.a1x', 'a.a2']);
  });

  it('`*` y `**` a secas seleccionan las raices y todo el Modelo', () => {
    expect(visibles({ include: ['*'] })).toEqual(['a', 'b', 'c']);
    expect(visibles({ include: ['**'] })).toEqual(['a', 'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('exclude quita lo seleccionado, con los mismos selectores', () => {
    expect(visibles({ include: ['**'], exclude: ['c', 'a.**'] })).toEqual(['a', 'b', 'b.b1']);
  });

  it('depth limita el nivel de anidacion (las raices son el nivel 1)', () => {
    expect(visibles({ include: ['**'], depth: 1 })).toEqual(['a', 'b', 'c']);
    expect(visibles({ include: ['**'], depth: 2 })).toEqual(['a', 'a.a1', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('una Vista sin include no muestra nada', () => {
    expect(visibles({})).toEqual([]);
  });

  it('las Aristas visibles son las que tienen ambos extremos visibles', () => {
    const vista = resolveView(fuente({ include: ['a.*', 'c'] }), 'v');

    expect(vista?.edges).toEqual([{ from: { node: 'a.a2' }, to: { node: 'c' } }]);
  });

  it('los Nodos visibles solo listan como hijos a los visibles', () => {
    const vista = resolveView(fuente({ include: ['a', 'a.a1.**'] }), 'v');
    const a = vista?.nodes.find((n) => n.id === 'a');

    expect(a?.children).toEqual([]);
    expect(vista?.nodes.map((n) => n.id)).toEqual(['a', 'a.a1.a1x']);
  });

  it('una Vista inexistente devuelve undefined y la Fuente no se modifica', () => {
    const f = fuente({ include: ['**'] });
    const antes = JSON.stringify(f);

    expect(resolveView(f, 'nada')).toBeUndefined();
    resolveView(f, 'v');
    expect(JSON.stringify(f)).toBe(antes);
  });
});

describe('Vistas en el esquema', () => {
  it('una Vista con type desconocido es rechazada por el esquema', () => {
    expect(() => fuente({ type: 'secuencia' })).toThrow();
  });
});
