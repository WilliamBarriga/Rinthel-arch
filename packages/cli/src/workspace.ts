import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { isFontFile, fontMimeType } from 'canonical';
import type { ArchivosDelWorkspace } from 'dsl';

/** Nombre de la carpeta de salida derivada del Workspace (build y Registro de actividad). */
export const CARPETA_DE_SALIDA = '.diagrams';

/** `<raiz>/.diagrams` */
export const carpetaDeSalida = (raiz: string): string => join(raiz, CARPETA_DE_SALIDA);

const EXTENSION = '.dg';
const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist']);

/**
 * Ruta relativa con `/` -> lo que `leer` saca de cada archivo que `acepta`. Salta carpetas ocultas
 * (`.diagrams/`), `node_modules`, `dist` y las que `salta`; no baja de `profundidad` carpetas bajo `raiz`.
 */
function recorrer(
  raiz: string,
  acepta: (nombre: string) => boolean,
  leer: (ruta: string) => string,
  { profundidad = Infinity, salta = () => false }: { profundidad?: number; salta?: (nombre: string) => boolean } = {},
): Record<string, string> {
  const archivos: Record<string, string> = {};
  const visitar = (carpeta: string, nivel: number): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (entrada.name.startsWith('.') || CARPETAS_IGNORADAS.has(entrada.name)) continue;
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) {
        if (nivel < profundidad && !salta(entrada.name)) visitar(ruta, nivel + 1);
      } else if (acepta(entrada.name)) archivos[relative(raiz, ruta).split(sep).join('/')] = leer(ruta);
    }
  };
  visitar(raiz, 0);
  return archivos;
}

/** Archivos `.dg` y `.svg` (iconos) bajo `raiz`. Lanza si la raiz no existe o is not a folder. */
export function leerWorkspace(raiz: string): ArchivosDelWorkspace {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' is not a folder`);
  return recorrer(raiz, (nombre) => nombre.endsWith(EXTENSION) || nombre.endsWith('.svg'), (ruta) => readFileSync(ruta, 'utf8'));
}

/** Rutas relativas con `/` de todos los archivos bajo `raiz` (para revisar las convenciones de nombres). */
export function leerRutas(raiz: string): string[] {
  return Object.keys(recorrer(raiz, () => true, () => ''));
}

/**
 * Relative `/` paths of the `.dg` files under `raiz`, at most `profundidad` folders down, skipping the folders that
 * `recorrer` skips and those `salta` names (how `scan` looks for a Workspace).
 */
export function rutasDeDg(raiz: string, profundidad: number, salta: (nombre: string) => boolean): string[] {
  return Object.keys(recorrer(raiz, (nombre) => nombre.endsWith(EXTENSION), () => '', { profundidad, salta }));
}

const EXTENSIONES_DE_RECURSO = ['.tsx', '.ttf', '.otf', '.woff', '.woff2'];

/**
 * Componentes `.tsx` y fuentes tipograficas bajo `raiz`: ruta relativa con `/` -> SHA-256 del contenido.
 * Lanza si la raiz no existe o is not a folder.
 */
export function leerRecursos(raiz: string): Record<string, string> {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' is not a folder`);
  return recorrer(raiz, (nombre) => EXTENSIONES_DE_RECURSO.some((extension) => nombre.endsWith(extension)), (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex'));
}

export { isFontFile as esArchivoDeFuente };

/** Rutas relativas a `raiz`, con `/`. */
export function leerFuentes(raiz: string): string[] {
  return Object.keys(leerRecursos(raiz)).filter(isFontFile);
}

/**
 * Bytes y tipo MIME de `ruta` en la primera de las `raices` que la tenga. Solo extensiones de fuente, solo archivos
 * regulares y solo si, resueltos los enlaces simbolicos, siguen dentro de su raiz; cualquier otra cosa da `undefined`.
 */
export function leerArchivoDeFuente(raices: readonly string[], ruta: string): { bytes: Buffer; tipo: string } | undefined {
  const tipo = fontMimeType(ruta);
  if (tipo === undefined) return undefined;
  for (const raiz of raices) {
    try {
      const real = realpathSync(destinoEnWorkspace(raiz, ruta));
      if (!real.startsWith(realpathSync(raiz) + sep) || !statSync(real).isFile()) continue;
      return { bytes: readFileSync(real), tipo };
    } catch {
      // fuera de la raiz, inexistente o ilegible: se prueba la siguiente raiz
    }
  }
  return undefined;
}

/** Lo que `build` reemplaza en `.diagrams/`; el resto (el Registro de actividad) se conserva. */
const SALIDA_DE_BUILD = ['canonico.json', 'geometria'];
/**
 * Reemplaza `<raiz>/.diagrams/<subcarpeta>` (por defecto, `canonico.json` y `geometria/`) por `archivos` (ruta
 * relativa a `.diagrams/` con `/`): no quedan restos de una Vista que ya no existe.
 */
export function escribirSalida(
  raiz: string,
  archivos: Readonly<Record<string, string | Uint8Array>>,
  subcarpeta = '',
): void {
  const destino = carpetaDeSalida(raiz);
  for (const ruta of subcarpeta === '' ? SALIDA_DE_BUILD : [subcarpeta]) rmSync(join(destino, ruta), { recursive: true, force: true });
  for (const [ruta, texto] of Object.entries(archivos)) {
    const archivo = join(destino, ...ruta.split('/'));
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, texto);
  }
}

/** Crea las carpetas que falten. Atomico (temporal y rename): nadie ve el archivo a medias. */
export function escribirTexto(ruta: string, texto: string): void {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporal, texto);
    renameSync(temporal, ruta);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
}

/** `ruta` es relativa a `raiz`, con `/`; lanza si el destino queda fuera de la raiz. */
export function destinoEnWorkspace(raiz: string, ruta: string): string {
  const base = resolve(raiz);
  const destino = resolve(base, ...ruta.split('/'));
  if (ruta.startsWith('/') || isAbsolute(ruta) || !destino.startsWith(base + sep)) {
    throw new Error(`'${ruta}' is outside the Workspace`);
  }
  return destino;
}
