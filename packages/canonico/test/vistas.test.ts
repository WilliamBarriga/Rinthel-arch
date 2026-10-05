import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { EstadoDeColapso } from 'canonico';

const nodo = (id: string, children: unknown[] = []) => ({
  id,
  type: 'servicio',
  title: id.split('.').pop(),
  description: '',
  children,
});

/** a { a1 { a1x } a2 }, b { b1 }, c */
function fuente(vista: Record<string, unknown>, aristasExtra: unknown[] = []) {
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
        { from: { node: 'a.a2' }, to: { node: 'b.b1' } },
        ...aristasExtra,
      ],
    },
    views: [{ id: 'v', type: 'architecture', include: [], exclude: [], ...vista }],
  });
}

function visibles(vista: Record<string, unknown>, estado?: EstadoDeColapso): string[] {
  return (resolveView(fuente(vista), 'v', estado)?.nodes ?? []).map((n) => n.id);
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

  it('exclude no arrastra a los descendientes: un hijo visible bajo un Nodo excluido sigue visible', () => {
    expect(visibles({ include: ['**'], exclude: ['a'] })).toEqual([
      'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'b.b1', 'c',
    ]);
  });

  it('depth 0 no muestra nada', () => {
    expect(visibles({ include: ['**'], depth: 0 })).toEqual([]);
  });

  it('una Vista sin include no muestra nada', () => {
    expect(visibles({})).toEqual([]);
  });

  it('las Aristas visibles son las que tienen ambos extremos visibles', () => {
    const vista = resolveView(fuente({ include: ['a.*', 'c'] }), 'v');

    expect(vista?.edges).toEqual([{ from: { node: 'a.a2' }, to: { node: 'c' }, count: 1 }]);
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

describe('resolveView: colapso de Grupos', () => {
  const nodoDe = (id: string, estado?: EstadoDeColapso, vista: Record<string, unknown> = {}) =>
    resolveView(fuente({ include: ['**'], ...vista }), 'v', estado)?.nodes.find((n) => n.id === id);

  it('un Grupo que excede depth abre colapsado, con el contador de hijos', () => {
    const a = nodoDe('a', undefined, { depth: 1 });

    expect(a).toMatchObject({ collapsed: true, childCount: 2, children: [] });
    expect(nodoDe('c', undefined, { depth: 1 })).toMatchObject({ collapsed: false, childCount: 0 });
  });

  it('un Grupo dentro de depth se muestra expandido', () => {
    const vista = resolveView(fuente({ include: ['**'], depth: 2 }), 'v');

    expect(vista?.nodes.find((n) => n.id === 'a')).toMatchObject({ collapsed: false });
    expect(vista?.nodes.find((n) => n.id === 'a.a1')).toMatchObject({ collapsed: true, childCount: 1 });
    expect(vista?.nodes.map((n) => n.id)).toEqual(['a', 'a.a1', 'a.a2', 'b', 'b.b1', 'c']);
  });

  it('`expanded` anula el colapso por depth y `collapsed` el estado abierto', () => {
    expect(visibles({ include: ['**'], depth: 1, expanded: ['a'] })).toEqual(['a', 'a.a1', 'a.a2', 'b', 'c']);
    expect(visibles({ include: ['**'], collapsed: ['a'] })).toEqual(['a', 'b', 'b.b1', 'c']);
  });

  it('el estado de colapso del llamador gana a la Vista', () => {
    const vista = { include: ['**'], depth: 1, collapsed: ['b'], expanded: ['a'] };

    expect(visibles(vista, { collapsed: ['a'], expanded: ['b'] })).toEqual(['a', 'b', 'b.b1', 'c']);
  });

  it('un Grupo con link no se expande ni con estado expanded', () => {
    const vista = { include: ['**'], links: [{ node: 'b', view: 'detalle' }] };

    expect(visibles(vista, { expanded: ['b'] })).toEqual(['a', 'a.a1', 'a.a1.a1x', 'a.a2', 'b', 'c']);
    expect(nodoDe('b', undefined, vista)).toMatchObject({ collapsed: true, link: 'detalle' });
  });

  it('las Aristas de los hijos se elevan al Grupo colapsado y se fusionan por par de extremos', () => {
    const vista = resolveView(fuente({ include: ['**'], depth: 1 }), 'v');

    expect(vista?.edges).toEqual([
      { from: { node: 'a' }, to: { node: 'b' }, count: 2 },
      { from: { node: 'a' }, to: { node: 'c' }, count: 1 },
    ]);
  });

  it('una Arista interna de un Grupo colapsado desaparece y reaparece al expandirlo', () => {
    const interna = [{ from: { node: 'a.a1' }, to: { node: 'a.a2' } }];
    const cerrado = resolveView(fuente({ include: ['**'], depth: 1 }, interna), 'v');
    const abierto = resolveView(fuente({ include: ['**'], depth: 1, expanded: ['a'] }, interna), 'v');

    expect(cerrado?.edges.some((e) => e.from.node === 'a' && e.to.node === 'a')).toBe(false);
    expect(abierto?.edges).toContainEqual({ from: { node: 'a.a1' }, to: { node: 'a.a2' }, count: 1 });
  });

  it('al elevar se pierde el Atributo del extremo; los extremos no elevados lo conservan', () => {
    const f = fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: {
        nodes: [
          { ...nodo('t', [{ ...nodo('t.x'), attributes: [{ name: 'id', type: 'int' }] }]) },
          { ...nodo('u'), attributes: [{ name: 'tid', type: 'int' }] },
        ],
        edges: [{ from: { node: 'u', attribute: 'tid' }, to: { node: 't.x', attribute: 'id' }, toCardinality: '1' }],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], depth: 1 }],
    });

    expect(resolveView(f, 'v')?.edges).toEqual([
      { from: { node: 'u', attribute: 'tid' }, to: { node: 't' }, toCardinality: '1', count: 1 },
    ]);
  });

  it('el estado de colapso no modifica la Fuente', () => {
    const f = fuente({ include: ['**'], depth: 1 });
    const antes = JSON.stringify(f);

    resolveView(f, 'v', { expanded: ['a'] });
    expect(JSON.stringify(f)).toBe(antes);
  });
});

describe('Vistas en el esquema', () => {
  it('una Vista con type desconocido es rechazada por el esquema', () => {
    expect(() => fuente({ type: 'secuencia' })).toThrow();
  });
});

describe('resolveView: label y color de cada Nodo', () => {
  const conTipos = (vista: Record<string, unknown>) =>
    fuenteCanonicaSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio', color: 'blue' }, { name: 'base' }] },
      model: {
        nodes: [
          { id: 'a', type: 'servicio', title: 'Servicio A', description: '', children: [] },
          { id: 'b', type: 'base', title: 'Base B', description: '', children: [] },
        ],
      },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [], ...vista }],
    });

  it('el label es el titulo y el color es el del Tipo de nodo, si lo tiene', () => {
    const [a, b] = resolveView(conTipos({}), 'v')!.nodes;

    expect(a).toMatchObject({ label: 'Servicio A', color: 'blue' });
    expect(b).toMatchObject({ label: 'Base B' });
    expect(b).not.toHaveProperty('color');
  });

  it('el override de la Vista gana al titulo y al color del Tipo', () => {
    const [a, b] = resolveView(conTipos({ overrides: [{ node: 'a', label: 'Entrada', color: 'red' }, { node: 'b', color: 'green' }] }), 'v')!.nodes;

    expect(a).toMatchObject({ label: 'Entrada', color: 'red' });
    expect(b).toMatchObject({ label: 'Base B', color: 'green' });
  });
});
