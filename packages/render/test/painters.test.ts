import { describe, expect, it } from 'vitest';

import type { ResolvedNode } from 'canonical';
import { resolveStyle } from 'render';

import type { MarkupElement } from '../src/element';
import { paintEdge, paintControl, paintBoxState, paintEdgeLabel, paintGroup, paintNode } from '../src/painters';
import { NEUTRAL_THEME, headerHeight, placeInBox } from 'theme';

const style = resolveStyle(NEUTRAL_THEME, 'architecture');
const box = { x: 0, y: 0, width: 140, height: 60 };
const baseNode = { id: 'n', label: 'N', collapsed: false, children: [], source: [], type: 't', attributes: [], childCount: 0 } as unknown as ResolvedNode;
const withNode = (partial: Partial<ResolvedNode>): ResolvedNode => ({ ...baseNode, ...partial });

const find = (e: MarkupElement | string, tag: string): MarkupElement | undefined => {
  if (typeof e === 'string') return undefined;
  if (e.tag === tag) return e;
  for (const h of e.children ?? []) {
    const r = find(h, tag);
    if (r !== undefined) return r;
  }
  return undefined;
};


describe('painters per part', () => {
  it('the Node puts its title on the Slot rectangle and the Attribute rows on theirs', () => {
    const attributes = [{ name: 'id', type: 'uuid', notes: '' }];
    const data = { node: withNode({ attributes }), box, stroke: 'red', text: 'N', withAttributes: true };
    const [title, ...rest] = paintNode(style, data);
    const { slots } = placeInBox(style.metrics, { titulo: 'N', atributos: attributes, icono: false }, box.width);

    expect(title!.attrs['data-slot']).toBe('title');
    expect(title!.attrs['style']).toContain(`top:${slots.title!.y}px;width:${slots.title!.width}px;height:${slots.title!.height}px`);
    expect(rest[0]!.attrs['data-slot']).toBe('attrs');
    expect(JSON.stringify(rest)).toContain('id: uuid');
  });

  it('the icon is the `icon` Slot: it goes on its rectangle, left of the title and without overlapping it', () => {
    const icons = { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' };
    const elements = paintNode(style, { node: withNode({ icon: 'box' }), box, stroke: 'red', text: 'N', withAttributes: false, icons });
    const rectOf = (e: MarkupElement) => Object.fromEntries([...e.attrs['style']!.matchAll(/(left|top|width|height):([\d.]+)px/g)].map((m) => [m[1], Number(m[2])])) as Record<string, number>;
    const icon = elements.find((e) => e.attrs['data-slot'] === 'icon')!;
    const title = elements.find((e) => e.attrs['data-slot'] === 'title')!;

    expect(rectOf(icon)['left']! + rectOf(icon)['width']!).toBeLessThanOrEqual(rectOf(title)['left']!);
    expect(icon.html).toContain('<svg width=');
    expect(paintNode(style, { node: withNode({}), box, stroke: 'red', text: 'N', withAttributes: false }).map((e) => e.attrs['data-slot'])).toEqual(['title']);
  });

  it('without withAttributes the Node does not draw the attrs Slot', () => {
    const elements = paintNode(style, { node: withNode({ attributes: [{ name: 'id', type: 'uuid', notes: '' }] }), box, stroke: 'red', text: 'N', withAttributes: false });

    expect(elements.map((e) => e.attrs['data-slot'])).toEqual(['title']);
  });

  it('the Group head places its Slots with the mini-layout of the open Group Metrics, without overlapping the icon and inside the head band', () => {
    const icons = { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' };
    const data = { node: withNode({ icon: 'box', children: [withNode({ id: 'h' })] }), box, stroke: 'red', text: 'G', icons };
    const elements = paintGroup(style, data);
    const m = style.table.grupoAbierto;
    const { slots } = placeInBox(m, { titulo: 'G', atributos: [], icono: true }, box.width - 2 * m.margenDeControl);
    const rectOf = (e: MarkupElement) => Object.fromEntries([...e.attrs['style']!.matchAll(/(left|top|width|height):([\d.]+)px/g)].map((x) => [x[1], Number(x[2])])) as Record<string, number>;
    const icon = rectOf(elements.find((e) => e.attrs['data-slot'] === 'icon')!);
    const title = rectOf(elements.find((e) => e.attrs['data-slot'] === 'title')!);

    expect(title).toMatchObject({ left: slots.title!.x, top: slots.title!.y, width: slots.title!.width });
    expect(icon['left']! + icon['width']!).toBeLessThanOrEqual(title['left']!);
    expect(title['top']! + title['height']!).toBeLessThanOrEqual(headerHeight(m));
    expect(title['left']! + title['width']!).toBeLessThanOrEqual(box.width - 2 * m.margenDeControl);
    expect(JSON.stringify(elements)).not.toContain('rd-encabezado');
  });

  it('the Group head follows the layout the Theme declares, not a fixed position', () => {
    const theme = { ...NEUTRAL_THEME, grupo: { ...NEUTRAL_THEME.grupo, slots: { direccion: 'row' as const, gap: 4, pad: 2, hijos: [{ slot: 'title' as const }, { slot: 'icon' as const }] } } };
    const ownValue = resolveStyle(theme, 'architecture');
    const icons = { keys: () => ['box'], resolve: () => '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' };
    const elements = paintGroup(ownValue, { node: withNode({ icon: 'box', children: [withNode({ id: 'h' })] }), box, stroke: 'red', text: 'G', icons });

    expect(elements.map((e) => e.attrs['data-slot'])).toEqual(['title', 'icon']);
  });

  it('the control shows the Style glyph according to the state', () => {
    const glyph = (collapsed: boolean, e = style) => paintControl(e, { node: withNode({ collapsed }), box, onClick: () => {} }).children![0];

    expect(glyph(false)).toBe('-');
    expect(glyph(true)).toBe('+');
    expect(glyph(true, { ...style, glyphs: { expandedGlyph: 'v', collapsedGlyph: '>' } })).toBe('>');
  });

  it('the state outline is a mark without its own style: the sheet gives it', () => {
    const mark = paintBoxState('selected', 'n');

    expect(mark.attrs).toEqual({ class: 'rd-estado', 'data-state': 'selected', 'data-selected': 'n' });
    expect(paintBoxState('hover', 'n').attrs['data-selected']).toBeUndefined();
  });

  it('the Edge uses the stroke and arrow of the Style paint', () => {
    const g = paintEdge(style, { id: 'a -> b', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] });
    const path = find(g, 'path')!;

    expect(path.attrs['stroke']).toBe('#9ca3af');
    expect(JSON.stringify(g)).toContain('"data-marker":"fin"');
  });

  it('the Edge label carries the Style halo', () => {
    const text = paintEdgeLabel(style, { id: 'e', text: 'x', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], box: undefined });

    expect(text.attrs).toMatchObject({ stroke: style.label.halo.color, 'stroke-width': '3', 'paint-order': 'stroke' });
    expect(paintEdgeLabel({ ...style, label: { ...style.label, halo: { color: 'black', width: 5 } } }, { id: 'e', text: 'x', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], box: undefined }).attrs).toMatchObject({ stroke: 'black', 'stroke-width': '5' });
  });
});
