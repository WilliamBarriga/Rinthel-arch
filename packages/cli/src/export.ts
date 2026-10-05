import { combineIconProviders, genericIcons, resolveView, workspaceIcons } from 'canonico';
import type { FuenteCanonica, Tema } from 'canonico';
import { renderToSvgString } from 'render';
import type { FuenteIncrustada } from 'render';

import type { GeometriaCacheada, SalidaDeBuild } from './build';

/** Formatos de fuente que el Workspace puede traer, de mayor a menor preferencia. */
const FORMATOS: readonly [extension: string, mime: string][] = [
  ['woff2', 'font/woff2'],
  ['woff', 'font/woff'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
];

/** Familias de un valor CSS `font-family` (`"Inter, sans-serif"` -> `Inter`, `sans-serif`). */
function familiasDe(valor: string): string[] {
  return valor.split(',').map((familia) => familia.trim().replace(/^["']|["']$/g, '')).filter((familia) => familia !== '');
}

/**
 * Fuentes del Tema que el Workspace aporta como archivo: `<Familia>.woff2` (o
 * `woff`, `ttf`, `otf`) en cualquier carpeta, con el contenido en base64. Una
 * familia sin archivo (`sans-serif`, una fuente del sistema) no se incrusta.
 */
export function fuentesDelTema(tema: Tema, archivos: Readonly<Record<string, string>>): FuenteIncrustada[] {
  const rutas = Object.keys(archivos).sort();
  const familias = [...new Set(Object.values(tema.fonts).flatMap(familiasDe))];
  return familias.flatMap((family) => {
    for (const [extension, mime] of FORMATOS) {
      const ruta = rutas.find((candidata) => candidata.split('/').pop() === `${family}.${extension}`);
      if (ruta !== undefined) return [{ family, mime, data: archivos[ruta] as string }];
    }
    return [];
  });
}

/**
 * Un SVG por Vista (`svg/<vista>.svg`) a partir de la salida de `build`: la Fuente
 * canonica y la geometria cacheada. Sin geometria cacheada para una Vista, lanza.
 */
export function exportarSvg(
  fuente: FuenteCanonica,
  geometrias: Readonly<Record<string, GeometriaCacheada>>,
  workspace: Readonly<Record<string, string>>,
  fuentes: Readonly<Record<string, string>>,
): SalidaDeBuild {
  const icons = combineIconProviders(workspaceIcons(workspace), genericIcons());
  const salida: SalidaDeBuild = {};
  for (const vista of fuente.views) {
    const cacheada = geometrias[vista.id];
    const resuelta = resolveView(fuente, vista.id);
    if (cacheada === undefined || resuelta === undefined) {
      throw new Error(`Falta la geometria de la Vista '${vista.id}'`);
    }
    const theme = fuente.themes.find(({ name }) => name === cacheada.theme);
    if (theme === undefined) throw new Error(`El Tema '${cacheada.theme}' no esta en la Fuente canonica`);
    const { geometry } = cacheada;
    salida[`svg/${vista.id}.svg`] = `${renderToSvgString({
      view: resuelta,
      geometry,
      theme,
      icons,
      width: geometry.width,
      height: geometry.height,
      fonts: fuentesDelTema(theme, fuentes),
    })}\n`;
  }
  return salida;
}
