/**
 * Route a viewer uses to request the Workspace font files (served by `cli`, requested by `estudio`).
 * The rest of the `dev` routes and schemas are in `dev.ts` (`DEV_ROUTES`).
 */
export const FONTS_ROUTE = '/fuentes/';

/** URL relative to the `dev` server, with each segment encoded. */
export const fontUrl = (path: string): string => FONTS_ROUTE + path.split('/').map(encodeURIComponent).join('/');

const FONT_MIME_TYPES: Readonly<Record<string, string>> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** MIME type of a font file by its extension, or `undefined` if it is not a font. */
export function fontMimeType(path: string): string | undefined {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const point = name.lastIndexOf('.');
  return point <= 0 ? undefined : FONT_MIME_TYPES[name.slice(point).toLowerCase()];
}

/** By its extension. */
export const isFontFile = (path: string): boolean => fontMimeType(path) !== undefined;
