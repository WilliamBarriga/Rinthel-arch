import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Diagram } from 'render';
import type { DiagramProps } from 'render';

/** The HTML+SVG markup `Diagram` draws for those props, as a string. */
export function toHtml(props: DiagramProps): string {
  return renderToStaticMarkup(createElement(Diagram, props));
}

/** First opening tag that contains `mark` (e.g. `data-id="a"`), or undefined. */
export function tagWith(html: string, mark: string): string | undefined {
  return new RegExp(`<[a-z]+ [^>]*${mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`).exec(html)?.[0];
}

/** Value of a property of a tag's inline `style`. */
export function property(label: string | undefined, name: string): string | undefined {
  const style = /style="([^"]*)"/.exec(label ?? '')?.[1] ?? '';
  return style
    .split(';')
    .map((d) => d.split(/:(.*)/s))
    .find(([key]) => key === name)?.[1];
}

/** `left/top/width/height` (px) of a positioned tag. */
export function rectOf(label: string | undefined): { x: number; y: number; width: number; height: number } {
  const n = (name: string): number => Number.parseFloat(property(label, name) ?? 'NaN');
  return { x: n('left'), y: n('top'), width: n('width'), height: n('height') };
}

/** Translation (px) of a tag's inline `transform`. */
export function translationOf(label: string | undefined): { x: number; y: number } {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(property(label, 'transform') ?? '');
  return { x: Number(m?.[1]), y: Number(m?.[2]) };
}

/** Style sheet (`<style>`) of the drawing. */
export function sheetOf(html: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
}

/** Markup of a flat layer (`grupos`, `aristas` or `nodos`), up to the next one. */
export function layerOf(html: string, layer: 'grupos' | 'aristas' | 'nodos'): string {
  const order = ['grupos', 'aristas', 'nodos'];
  const from = html.indexOf(`data-capa="${layer}"`);
  const next = order[order.indexOf(layer) + 1];
  const hasta = next === undefined ? html.length : html.indexOf(`data-capa="${next}"`);
  return html.slice(from, hasta);
}
