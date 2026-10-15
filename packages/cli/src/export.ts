import { combineIconProviders, genericIcons, workspaceIcons } from 'canonico';
import { renderToSvgString } from 'render';

import type { SalidaDeBuild } from 'sesion';
import { fuentesDelTema } from './fuentes';
import { rasterizar } from './png';
import { vistasDibujables } from './vistas-dibujables';
import type { EntradaDeExport } from './vistas-dibujables';

/** Dibuja cada Vista desde la salida de `build`. Lanza si a una Vista le falta la geometria o esta obsoleta. */
function dibujarVistas(entrada: EntradaDeExport) {
  const icons = combineIconProviders(workspaceIcons(entrada.workspace), genericIcons());
  return vistasDibujables(entrada).map(({ id, theme, view, geometry }) => ({
    id,
    theme,
    svg: renderToSvgString({
      view,
      geometry,
      theme,
      icons,
      width: geometry.width,
      height: geometry.height,
      fonts: fuentesDelTema(theme, entrada.fuentes),
    }),
  }));
}

/** Un SVG por Vista (`svg/<vista>.svg`) a partir de la salida de `build`. */
export function exportarSvg(entrada: EntradaDeExport): SalidaDeBuild {
  return Object.fromEntries(dibujarVistas(entrada).map(({ id, svg }) => [`svg/${id}.svg`, `${svg}\n`]));
}

/** Un PNG por Vista (`png/<vista>.png`): el mismo SVG, rasterizado con las fuentes del Tema. */
export function exportarPng(entrada: EntradaDeExport): Record<string, Uint8Array> {
  return Object.fromEntries(
    dibujarVistas(entrada).map(({ id, svg, theme }) => [`png/${id}.png`, rasterizar(svg, theme, entrada.fuentes)]),
  );
}
