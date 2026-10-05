import { combineIconProviders, genericIcons, resolveView, workspaceIcons } from 'canonico';
import type { FuenteCanonica, Tema } from 'canonico';
import { renderToSvgString } from 'render';

import type { GeometriaCacheada, SalidaDeBuild } from './build';
import { fuentesDelTema } from './fuentes';
import { rasterizar } from './png';

interface VistaDibujada {
  id: string;
  theme: Tema;
  svg: string;
}

/** Dibuja cada Vista desde la salida de `build`. Sin geometria cacheada para una Vista, lanza. */
function dibujarVistas(
  fuente: FuenteCanonica,
  geometrias: Readonly<Record<string, GeometriaCacheada>>,
  workspace: Readonly<Record<string, string>>,
  fuentes: Readonly<Record<string, string>>,
): VistaDibujada[] {
  const icons = combineIconProviders(workspaceIcons(workspace), genericIcons());
  return fuente.views.map((vista) => {
    const cacheada = geometrias[vista.id];
    const resuelta = resolveView(fuente, vista.id);
    if (cacheada === undefined || resuelta === undefined) {
      throw new Error(`Falta la geometria de la Vista '${vista.id}'`);
    }
    const theme = fuente.themes.find(({ name }) => name === cacheada.theme);
    if (theme === undefined) throw new Error(`El Tema '${cacheada.theme}' no esta en la Fuente canonica`);
    const { geometry } = cacheada;
    const svg = renderToSvgString({
      view: resuelta,
      geometry,
      theme,
      icons,
      width: geometry.width,
      height: geometry.height,
      fonts: fuentesDelTema(theme, fuentes),
    });
    return { id: vista.id, theme, svg };
  });
}

/** Un SVG por Vista (`svg/<vista>.svg`) a partir de la salida de `build`. */
export function exportarSvg(
  fuente: FuenteCanonica,
  geometrias: Readonly<Record<string, GeometriaCacheada>>,
  workspace: Readonly<Record<string, string>>,
  fuentes: Readonly<Record<string, string>>,
): SalidaDeBuild {
  return Object.fromEntries(
    dibujarVistas(fuente, geometrias, workspace, fuentes).map(({ id, svg }) => [`svg/${id}.svg`, `${svg}\n`]),
  );
}

/** Un PNG por Vista (`png/<vista>.png`): el mismo SVG, rasterizado con las fuentes del Tema. */
export function exportarPng(
  fuente: FuenteCanonica,
  geometrias: Readonly<Record<string, GeometriaCacheada>>,
  workspace: Readonly<Record<string, string>>,
  fuentes: Readonly<Record<string, string>>,
): Record<string, Uint8Array> {
  return Object.fromEntries(
    dibujarVistas(fuente, geometrias, workspace, fuentes).map(({ id, svg, theme }) => [
      `png/${id}.png`,
      rasterizar(svg, theme, fuentes),
    ]),
  );
}
