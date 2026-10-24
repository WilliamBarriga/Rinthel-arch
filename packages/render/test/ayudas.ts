import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Diagram } from 'render';
import type { DiagramProps } from 'render';

/** El marcado HTML+SVG que dibuja `Diagram` para esas props, como cadena. */
export function aHtml(props: DiagramProps): string {
  return renderToStaticMarkup(createElement(Diagram, props));
}

/** Primera etiqueta de apertura que contiene `marca` (p. ej. `data-id="a"`), o undefined. */
export function etiquetaCon(html: string, marca: string): string | undefined {
  return new RegExp(`<[a-z]+ [^>]*${marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`).exec(html)?.[0];
}

/** Valor de una propiedad del `style` en linea de una etiqueta. */
export function propiedad(etiqueta: string | undefined, nombre: string): string | undefined {
  const estilo = /style="([^"]*)"/.exec(etiqueta ?? '')?.[1] ?? '';
  return estilo
    .split(';')
    .map((d) => d.split(/:(.*)/s))
    .find(([clave]) => clave === nombre)?.[1];
}

/** `left/top/width/height` (px) de una etiqueta posicionada. */
export function rectDe(etiqueta: string | undefined): { x: number; y: number; width: number; height: number } {
  const n = (nombre: string): number => Number.parseFloat(propiedad(etiqueta, nombre) ?? 'NaN');
  return { x: n('left'), y: n('top'), width: n('width'), height: n('height') };
}

/** Traslacion (px) del `transform` en linea de una etiqueta. */
export function traslacionDe(etiqueta: string | undefined): { x: number; y: number } {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(propiedad(etiqueta, 'transform') ?? '');
  return { x: Number(m?.[1]), y: Number(m?.[2]) };
}

/** Hoja de estilo (`<style>`) del dibujo. */
export function hojaDe(html: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
}

/** Marcado de una capa plana (`grupos`, `aristas` o `nodos`), hasta la siguiente. */
export function capaDe(html: string, capa: 'grupos' | 'aristas' | 'nodos'): string {
  const orden = ['grupos', 'aristas', 'nodos'];
  const desde = html.indexOf(`data-capa="${capa}"`);
  const siguiente = orden[orden.indexOf(capa) + 1];
  const hasta = siguiente === undefined ? html.length : html.indexOf(`data-capa="${siguiente}"`);
  return html.slice(desde, hasta);
}
