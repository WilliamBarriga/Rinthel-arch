/** Prefijo bajo el que `dev` sirve los estaticos del estudio; el HTML de `navegador/index.html` lo repite. */
export const RUTA_DEL_ESTUDIO = '/_estudio/';

/** Estaticos que produce el build en `dist/estudio/`, ademas de `index.html` (que se sirve en `/`). */
export const ARCHIVOS_DEL_ESTUDIO = ['pagina.js', 'worker.js', 'estilo.css'] as const;

/** Carpeta de `dist/estudio/` con los trozos de la pagina que se cargan bajo demanda (nombres con hash). */
export const CARPETA_DE_TROZOS = 'trozos';

/** Page of an exported Dev UI (`diagrams export`), an IIFE in `dist/estudio/`; `dev` does not serve it. */
export const PAGINA_EXPORTADA = 'exportado.js';

/** Ids of the elements of an exported HTML that carry the data (JSON) and the layout Worker code (text). */
export const ID_DE_LOS_DATOS = 'rinthel-datos';
export const ID_DEL_WORKER = 'rinthel-worker';
