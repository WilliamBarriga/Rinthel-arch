/**
 * Ruta con la que un visor pide los archivos de fuente del Workspace (la sirve `cli` y la pide `estudio`).
 * El estado de `dev` (`EstadoDeDev`, `IssueDeDev`) es transporte y vive en `estudio/protocolo`.
 */
export const RUTA_DE_FUENTES = '/fuentes/';

/** URL relativa al servidor de `dev`, con cada segmento codificado. */
export const urlDeFuente = (ruta: string): string => RUTA_DE_FUENTES + ruta.split('/').map(encodeURIComponent).join('/');
