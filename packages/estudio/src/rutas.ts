/** Prefijo bajo el que `dev` sirve los estaticos del estudio; el HTML de `navegador/index.html` lo repite. */
export const RUTA_DEL_ESTUDIO = '/_estudio/';

/** Estaticos que produce el build en `dist/estudio/`, ademas de `index.html` (que se sirve en `/`). */
export const ARCHIVOS_DEL_ESTUDIO = ['pagina.js', 'worker.js', 'estilo.css'] as const;

/** Carpeta de `dist/estudio/` con los trozos de la pagina que se cargan bajo demanda (nombres con hash). */
export const CARPETA_DE_TROZOS = 'trozos';
