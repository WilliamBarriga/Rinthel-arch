import { describe, expect, it } from 'vitest';

import { resolveStyle } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import type { MarkupElement } from '../src/element';
import { paintEdge, paintEdgeLabel } from '../src/painters';

const line = (name: string, props: Record<string, string | number>) => ({ nombre: name, primitiva: { tipo: 'line', props: { width: 2, style: 'solid', corner: 'sharp', cut: 6, radius: 8, ...props } } });
const theme = (edge: Partial<ResolvedTheme['arista']>): ResolvedTheme => ({ ...NEUTRAL_THEME, arista: { ...NEUTRAL_THEME.arista, ...edge } });
const everyone = (e: MarkupElement | string, tag: string): MarkupElement[] =>
  typeof e === 'string' ? [] : [...(e.tag === tag ? [e] : []), ...(e.children ?? []).flatMap((h) => everyone(h, tag))];

const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }];

describe('Theme Edges', () => {
  it('the stroke stack is drawn bottom to top: the wide translucent glow goes under the main one', () => {
    const style = resolveStyle(theme({ capas: [line('glow', { color: 'ORIGIN/0.3', width: 8 }), line('principal', { color: 'ORIGIN' })] }), 'architecture');
    const paths = everyone(paintEdge(style, { id: 'a -> b', points: L, origin: 'blue' }), 'path').filter((p) => p.attrs['data-capa'] !== undefined);

    expect(paths.map((r) => r.attrs['data-capa'])).toEqual(['glow', 'principal']);
    expect(paths[0]?.attrs).toMatchObject({ stroke: 'rgba(37, 99, 235, 0.3)', 'stroke-width': '8' });
    expect(paths[1]?.attrs).toMatchObject({ stroke: '#2563eb', 'stroke-width': '2' });
  });

  it('each stroke style has its drawing and the chamfer corner cuts the path', () => {
    const drawing = (props: Record<string, string | number>) =>
      everyone(paintEdge(resolveStyle(theme({ capas: [line('l', { color: 'blue', ...props })] }), 'architecture'), { id: 'e', points: L }), 'path')[0]!.attrs;

    expect(drawing({ style: 'dashed' })['stroke-dasharray']).toBe('8 4');
    expect(drawing({ style: 'dotted' })).toMatchObject({ 'stroke-dasharray': '0 4', 'stroke-linecap': 'round' });
    expect(drawing({ style: 'pixel' })).toMatchObject({ 'stroke-dasharray': '2 2', 'shape-rendering': 'crispEdges' });
    expect(drawing({})['d']).toBe('M 0 0 L 40 0 L 40 40');
    expect(drawing({ corner: 'chamfer', cut: 6 })['d']).toBe('M 0 0 L 34 0 L 40 6 L 40 40');
  });

  it('cap rounds or squares the stroke ends; without cap, the end is its style\'s', () => {
    const drawing = (props: Record<string, string | number>) =>
      everyone(paintEdge(resolveStyle(theme({ capas: [line('l', { color: 'blue', ...props })] }), 'architecture'), { id: 'e', points: L }), 'path')[0]!.attrs;

    expect(drawing({ cap: 'round' })['stroke-linecap']).toBe('round');
    expect(drawing({ cap: 'square' })['stroke-linecap']).toBe('square');
    expect(drawing({})['stroke-linecap']).toBeUndefined();
    expect(drawing({ style: 'dotted' })['stroke-linecap']).toBe('round');
  });

  it('the round corner curves each turn with a radius limited to half the segment', () => {
    const drawing = (props: Record<string, string | number>) =>
      everyone(paintEdge(resolveStyle(theme({ capas: [line('l', { color: 'blue', ...props })] }), 'architecture'), { id: 'e', points: L }), 'path')[0]!.attrs['d'];

    expect(drawing({ corner: 'round', radius: 10 })).toBe('M 0 0 L 30 0 Q 40 0 40 10 L 40 40');
    expect(drawing({ corner: 'round', radius: 60 })).toBe('M 0 0 L 20 0 Q 40 0 40 20 L 40 40');
  });

  it('the square marker is a filled square behind the tip', () => {
    const style = resolveStyle(theme({ capas: [line('l', { color: 'blue' })], origen: { tipo: 'square', props: { size: 6 } } }), 'architecture');
    const mark = everyone(paintEdge(style, { id: 'e', points: L }), 'g').find((g) => g.attrs['data-marker'] === 'origen');

    expect(mark?.children?.[0]).toMatchObject({ tag: 'rect', attrs: { x: '-6', y: '-3', width: '6', height: '6', fill: '#2563eb' } });
  });

  it('the source and end markers are rotated toward the path', () => {
    const style = resolveStyle(theme({ capas: [line('l', { color: 'blue' })], origen: { tipo: 'dot', props: { size: 6 } }, fin: { tipo: 'via', props: { size: 8 } } }), 'architecture');
    const marks = everyone(paintEdge(style, { id: 'e', points: L }), 'g').filter((g) => g.attrs['data-marker'] !== undefined);

    expect(marks.map((m) => m.attrs['data-marker'])).toEqual(['origen', 'fin']);
    expect(marks[0]?.attrs['transform']).toBe('translate(0 0) rotate(180)');
    expect(marks[1]?.attrs['transform']).toBe('translate(40 40) rotate(90)');
    expect(marks[0]?.children?.[0]).toMatchObject({ tag: 'circle', attrs: { r: '3', fill: '#2563eb' } });
  });

  it('the via is a pad centered on the endpoint: a disc of the color with the background hole', () => {
    const style = resolveStyle(theme({ capas: [line('l', { color: 'blue' })], fin: { tipo: 'via', props: { size: 10 } } }), 'architecture');
    const via = everyone(paintEdge(style, { id: 'e', points: L }), 'g').find((g) => g.attrs['data-marker'] === 'fin');

    expect(via?.children).toEqual([
      { tag: 'circle', attrs: { cx: '0', cy: '0', r: '5', fill: '#2563eb' } },
      { tag: 'circle', attrs: { cx: '0', cy: '0', r: '2', fill: NEUTRAL_THEME.tokens.background } },
    ]);
  });

  it('the label with fill draws its box with the Theme radius; without fill it only carries a halo', () => {
    const box = { x: 10, y: 10, width: 50, height: 16 };
    const withBox = resolveStyle(theme({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 5, fill: 'blue' } } }), 'architecture');
    const withoutBox = resolveStyle(NEUTRAL_THEME, 'architecture');
    const a = paintEdgeLabel(withBox, { id: 'e', text: 'x', points: L, box });
    const b = paintEdgeLabel(withoutBox, { id: 'e', text: 'x', points: L, box });

    expect(everyone(a, 'rect')[0]?.attrs).toMatchObject({ x: '10', width: '50', rx: '5', fill: '#2563eb' });
    expect(everyone(a, 'text')[0]?.attrs['stroke']).toBeUndefined();
    expect(everyone(b, 'rect')).toEqual([]);
    expect(everyone(b, 'text')[0]?.attrs['paint-order']).toBe('stroke');
  });

  it('the radius of the label box is limited to half its height: a pill, never an ellipse', () => {
    const style = resolveStyle(theme({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 50, fill: 'blue' } } }), 'architecture');
    const rect = everyone(paintEdgeLabel(style, { id: 'e', text: 'x', points: L, box: { x: 0, y: 0, width: 60, height: 20 } }), 'rect')[0]!;

    expect(rect.attrs).toMatchObject({ rx: '10', ry: '10' });
  });

  it('the label carries the Theme color, weight, mono font, border, hard shadow and tilt', () => {
    const props = { scale: 0.85, pad: 4, radius: 3, fill: 'amber', border: 'gray', color: 'red', weight: 700, font: 'mono', 'border-width': 1.5, shadow: 'gray', rotate: -2 };
    const style = resolveStyle(theme({ etiqueta: { tipo: 'label', props } }), 'architecture');
    const g = paintEdgeLabel(style, { id: 'e', text: 'x', points: L, box: { x: 0, y: 0, width: 60, height: 20 } });
    const [shadowValue, box] = everyone(g, 'rect');
    const text = everyone(g, 'text')[0]!;

    expect(typeof g !== 'string' && g.attrs['transform']).toBe('rotate(-2 30 10)');
    expect(shadowValue!.attrs).toMatchObject({ x: '2', y: '2', fill: NEUTRAL_THEME.palette['gray'] });
    expect(box!.attrs).toMatchObject({ x: '0', 'stroke-width': '1.5', stroke: NEUTRAL_THEME.palette['gray'] });
    expect(text.attrs).toMatchObject({ fill: NEUTRAL_THEME.palette['red'], 'font-weight': '700', 'font-family': style.monoFont });
  });

  it('chevron is an open V and hollow a ring hollowed with the background color', () => {
    const style = resolveStyle(theme({ capas: [line('l', { color: 'blue' })], origen: { tipo: 'hollow', props: { size: 7 } }, fin: { tipo: 'chevron', props: { size: 9 } } }), 'architecture');
    const marks = everyone(paintEdge(style, { id: 'e', points: L }), 'g').filter((g) => g.attrs['data-marker'] !== undefined);

    expect(marks[0]?.children?.[0]).toMatchObject({ tag: 'circle', attrs: { r: '3.5', fill: NEUTRAL_THEME.tokens.background, stroke: '#2563eb', 'stroke-width': '1' } });
    expect(marks[1]?.children?.[0]).toMatchObject({ tag: 'path', attrs: { fill: 'none', stroke: '#2563eb', 'stroke-linecap': 'round' } });
  });

  it('cross is an X centered on the endpoint, in the stroke color', () => {
    const style = resolveStyle(theme({ capas: [line('l', { color: 'blue' })], fin: { tipo: 'cross', props: { size: 10 } } }), 'architecture');
    const mark = everyone(paintEdge(style, { id: 'e', points: L }), 'g').find((g) => g.attrs['data-marker'] === 'fin')!;

    expect(mark.children).toHaveLength(1);
    expect(mark.children?.[0]).toMatchObject({ tag: 'path', attrs: { d: 'M -5 -5 L 5 5 M -5 5 L 5 -5', stroke: '#2563eb', fill: 'none' } });
  });
});
