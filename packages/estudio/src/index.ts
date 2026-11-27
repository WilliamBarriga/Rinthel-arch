/**
 * `estudio`: la app de navegador de `dev` (ADR 0004, enmienda `estudio`). Esta entrada es la de Node, minima:
 * `activosDelEstudio()` da las rutas en disco de los estaticos que produce el build (`dist/estudio/`), y
 * `RUTA_DEL_ESTUDIO` el prefijo bajo el que `cli` los sirve. El contrato del protocolo esta en `estudio/protocolo`.
 * Export (`diagrams export`): `capturarExportado` (the data, through the `dev` API) and `htmlDeExportado` (the file).
 * Invariantes: no empaqueta nada; solo lista los trozos de la pagina (`trozos/`, con hash) en cada llamada; las rutas
 * existen solo tras `pnpm --filter estudio build`.
 * Depende de `canonical`, `layout`, `render`, `sesion` (solo `devEnMemoria` de `estudio/contrato`) y `shell` (solo la
 * app de navegador, que no se exporta por aqui).
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ARCHIVOS_DEL_ESTUDIO, CARPETA_DE_TROZOS } from './rutas';

export { RUTA_DEL_ESTUDIO } from './rutas';
export { capturarExportado, datosDeExportadoSchema, FORMATO_DEL_EXPORTADO } from './exportado';
export type { DatosDeExportado, FuentesDeCaptura, LeerFuente } from './exportado';
export { htmlDeExportado } from './html-de-exportado';
export type { OpcionesDelHtml } from './html-de-exportado';

export interface ActivosDelEstudio {
  /** HTML de la pagina, que `dev` sirve en `/`. */
  indice: string;
  /** Nombre publico bajo `/_estudio/` -> ruta absoluta en disco. Solo se sirven estos. */
  archivos: Readonly<Record<string, string>>;
}

/** `../dist/estudio/` vale igual desde `src/index.ts` (pruebas) que desde `dist/index.js` (build). */
const CARPETA = new URL('../dist/estudio/', import.meta.url);

/** The build folder (`dist/estudio/`): `htmlDeExportado` reads the export page, the Worker and the CSS from it. */
export const carpetaDelEstudio = (): string => fileURLToPath(CARPETA);

/** Lista los trozos de la pagina en cada llamada: un rebuild cambia sus nombres (llevan hash). */
export function activosDelEstudio(): ActivosDelEstudio {
  const carpetaDeTrozos = new URL(`${CARPETA_DE_TROZOS}/`, CARPETA);
  const trozos = existsSync(carpetaDeTrozos) ? readdirSync(carpetaDeTrozos).map((t) => `${CARPETA_DE_TROZOS}/${t}`) : [];
  return {
    indice: fileURLToPath(new URL('index.html', CARPETA)),
    archivos: Object.fromEntries([...ARCHIVOS_DEL_ESTUDIO, ...trozos].map((nombre) => [nombre, fileURLToPath(new URL(nombre, CARPETA))])),
  };
}
