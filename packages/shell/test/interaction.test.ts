// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, edgeId, resolveView } from 'canonical';
import type { Geometry, GraphView } from 'canonical';

import { EMPTY_SELECTION, elementBox, elementAt, select } from '../src/interaction';
import { NEUTRAL_THEME, metricsOf } from 'theme';

const node = (id: string, extra: object = {}) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [], ...extra });

/** g (group) with child h (with Attributes), p outside; edge g.h -> p with a label. */
const source = canonicalFormSchema.parse({
  specification: { nodeTypes: [{ name: 'servicio' }] },
  model: {
    nodes: [
      node('g', { children: [node('g.h', { attributes: [{ name: 'id', type: 'uuid' }, { name: 'nombre', type: 'text' }] })] }),
      node('p'),
    ],
    edges: [{ from: { node: 'g.h' }, to: { node: 'p' }, label: 'usa' }],
  },
  views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
});
const view = resolveView(source, 'v', { expanded: ['g'] }) as GraphView;
const edge = view.edges[0]!;
const edgeIdent = edgeId(edge);
const { cabecera: header, fila: row } = metricsOf(NEUTRAL_THEME, 'architecture');

/** g at (100,100) 300x200; h inside g at (20,40) 200x{header+2 rows}; p at (1000,100). */
const geometry: Geometry = {
  nodes: {
    g: { x: 100, y: 100, width: 300, height: 200 },
    'g.h': { x: 20, y: 40, width: 200, height: header + 2 * row },
    p: { x: 1000, y: 100, width: 100, height: 50 },
  },
  edges: { [edgeIdent]: { points: [{ x: 320, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 125 }, { x: 1000, y: 125 }] } },
  labels: { [edgeIdent]: { x: 480, y: 170, width: 60, height: 20 } },
  kind: 'grafo',
  pinsSolapados: [],
  width: 1200,
  height: 400,
};
const under = (x: number, y: number, tolerance?: number) =>
  elementAt(view, geometry, NEUTRAL_THEME, { x, y }, tolerance === undefined ? {} : { tolerance });

describe('elementAt', () => {
  it('returns the leaf Node, not the Group that contains it', () => {
    expect(under(130, 150)).toEqual({ kind: 'nodo', id: 'g.h' });
  });

  it('returns the Group in its own area', () => {
    expect(under(110, 280)).toEqual({ kind: 'nodo', id: 'g' });
  });

  it('returns the Attribute whose row falls under the point', () => {
    const rowY = 100 + 40 + header;
    expect(under(130, rowY + 1)).toEqual({ kind: 'atributo', id: 'g.h#id' });
    expect(under(130, rowY + row + 1)).toEqual({ kind: 'atributo', id: 'g.h#nombre' });
  });

  it('the header of a Node with Attributes is the Node', () => {
    expect(under(130, 100 + 40 + 2)).toEqual({ kind: 'nodo', id: 'g.h' });
  });

  it('returns the Edge when the point is on its route, within the tolerance', () => {
    expect(under(700, 160)).toEqual({ kind: 'arista', id: edgeIdent });
    expect(under(702, 160, 4)).toEqual({ kind: 'arista', id: edgeIdent });
    expect(under(720, 160, 4)).toBeUndefined();
  });

  it('the label has priority over the Edge and over the Node', () => {
    expect(under(510, 180)).toEqual({ kind: 'etiqueta', id: edgeIdent });
  });

  it('the Edge stays above the Node it crosses', () => {
    expect(under(330, 200)).toEqual({ kind: 'arista', id: edgeIdent });
  });

  it('an empty point returns nothing', () => {
    expect(under(50, 50)).toBeUndefined();
    expect(under(5000, 5000)).toBeUndefined();
  });

  it('finds elements far from any viewport (no culling)', () => {
    expect(under(1050, 120)).toEqual({ kind: 'nodo', id: 'p' });
  });

  it('can ignore the Attributes when they are not drawn', () => {
    const r = elementAt(view, geometry, NEUTRAL_THEME, { x: 130, y: 100 + 40 + header + 1 }, { attributes: false });
    expect(r).toEqual({ kind: 'nodo', id: 'g.h' });
  });
});

describe('elementBox', () => {
  it('gives the canvas box of each element kind', () => {
    const box = (el: Parameters<typeof elementBox>[3]) => elementBox(view, geometry, NEUTRAL_THEME, el);
    expect(box({ kind: 'nodo', id: 'g.h' })).toEqual({ x: 120, y: 140, width: 200, height: header + 2 * row });
    expect(box({ kind: 'atributo', id: 'g.h#nombre' })).toEqual({ x: 120, y: 140 + header + row, width: 200, height: row });
    expect(box({ kind: 'arista', id: edgeIdent })).toEqual({ x: 320, y: 125, width: 680, height: 75 });
    expect(box({ kind: 'etiqueta', id: edgeIdent })).toEqual({ x: 480, y: 170, width: 60, height: 20 });
    expect(box({ kind: 'nodo', id: 'no-existe' })).toBeUndefined();
  });
});

describe('Selection', () => {
  const a = { kind: 'nodo', id: 'a' } as const;
  const b = { kind: 'arista', id: 'b' } as const;

  it('replace leaves only the element', () => {
    expect(select(select(EMPTY_SELECTION, a, 'reemplazar'), b, 'reemplazar')).toEqual([b]);
  });

  it('add appends and does not duplicate', () => {
    const two = select(select(EMPTY_SELECTION, a, 'agregar'), b, 'agregar');
    expect(two).toEqual([a, b]);
    expect(select(two, a, 'agregar')).toEqual([a, b]);
  });

  it('remove takes out only that element; the same id with another kind is another element', () => {
    expect(select([a, b], a, 'quitar')).toEqual([b]);
    expect(select([a], { kind: 'etiqueta', id: 'a' }, 'quitar')).toEqual([a]);
  });

  it('toggle adds or removes', () => {
    expect(select([a], b, 'alternar')).toEqual([a, b]);
    expect(select([a, b], a, 'alternar')).toEqual([b]);
  });

  it('does not mutate the input Selection', () => {
    const input = [a] as const;
    select(input, b, 'agregar');
    expect(input).toEqual([a]);
  });
});
