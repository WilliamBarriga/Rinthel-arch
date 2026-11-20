/**
 * Ruta con la que un visor pide los archivos de fuente del Workspace (la sirve `cli` y la pide `estudio`).
 * El resto de rutas y esquemas de `dev` estan en `dev.ts` (`RUTAS_DE_DEV`).
 */
export const RUTA_DE_FUENTES = '/fuentes/';

/** URL relativa al servidor de `dev`, con cada segmento codificado. */
export const urlDeFuente = (ruta: string): string => RUTA_DE_FUENTES + ruta.split('/').map(encodeURIComponent).join('/');

const TIPOS_DE_FUENTE: Readonly<Record<string, string>> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** Tipo MIME de un archivo de fuente por su extension, o `undefined` si no es una fuente. */
export function tipoDeFuente(ruta: string): string | undefined {
  const nombre = ruta.slice(Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\')) + 1);
  const punto = nombre.lastIndexOf('.');
  return punto <= 0 ? undefined : TIPOS_DE_FUENTE[nombre.slice(punto).toLowerCase()];
}

/** Por su extension. */
export const esArchivoDeFuente = (ruta: string): boolean => tipoDeFuente(ruta) !== undefined;
