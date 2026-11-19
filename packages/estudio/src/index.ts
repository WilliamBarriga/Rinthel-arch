/**
 * `estudio`: la app de navegador de `dev` (ADR 0004, enmienda `estudio`). Esta entrada es la de Node, minima:
 * `activosDelEstudio()` da las rutas en disco de los estaticos que produce el build (`dist/estudio/`), y
 * `RUTA_DEL_ESTUDIO` el prefijo bajo el que `cli` los sirve. El contrato del protocolo esta en `estudio/protocolo`.
 * Invariantes: no lee ni empaqueta nada; las rutas existen solo tras `pnpm --filter estudio build`.
 * Depende de `canonico`, `layout`, `render` y `shell` (solo la app de navegador, que no se exporta por aqui).
 */
import { fileURLToPath } from 'node:url';

import { ARCHIVOS_DEL_ESTUDIO } from './rutas';

export { RUTA_DEL_ESTUDIO } from './rutas';

export interface ActivosDelEstudio {
  /** HTML de la pagina, que `dev` sirve en `/`. */
  indice: string;
  /** Nombre publico bajo `/_estudio/` -> ruta absoluta en disco. Solo se sirven estos. */
  archivos: Readonly<Record<string, string>>;
}

/** `../dist/estudio/` vale igual desde `src/index.ts` (pruebas) que desde `dist/index.js` (build). */
const CARPETA = new URL('../dist/estudio/', import.meta.url);

export function activosDelEstudio(): ActivosDelEstudio {
  return {
    indice: fileURLToPath(new URL('index.html', CARPETA)),
    archivos: Object.fromEntries(ARCHIVOS_DEL_ESTUDIO.map((nombre) => [nombre, fileURLToPath(new URL(nombre, CARPETA))])),
  };
}
