/** Adaptador de disco: unico punto del CLI que lee el Workspace. */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import type { ArchivosDelWorkspace } from 'dsl';

const EXTENSION = '.dg';
const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist']);

/**
 * Recorre `raiz` en profundidad (sin carpetas ocultas como `.diagrams/` ni
 * `node_modules`/`dist` salvo `incluirOcultas`) y devuelve ruta relativa con `/` ->
 * lo que `leer` saca de cada archivo que `acepta`.
 */
function recorrer(
  raiz: string,
  acepta: (nombre: string) => boolean,
  leer: (ruta: string) => string,
  incluirOcultas = false,
): Record<string, string> {
  const archivos: Record<string, string> = {};
  const visitar = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (!incluirOcultas && (entrada.name.startsWith('.') || CARPETAS_IGNORADAS.has(entrada.name))) continue;
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) visitar(ruta);
      else if (acepta(entrada.name)) archivos[ruta.slice(raiz.length + 1).split(sep).join('/')] = leer(ruta);
    }
  };
  visitar(raiz);
  return archivos;
}

/**
 * Lee los archivos `.dg` y `.svg` (iconos) bajo `raiz` y devuelve un mapa ruta
 * relativa con `/` -> texto. Lanza `Error` si la raiz no existe o no es una carpeta.
 */
export function leerWorkspace(raiz: string): ArchivosDelWorkspace {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' no es una carpeta`);
  return recorrer(raiz, (nombre) => nombre.endsWith(EXTENSION) || nombre.endsWith('.svg'), (ruta) => readFileSync(ruta, 'utf8'));
}

const CARPETA_DE_SALIDA = '.diagrams';
const FUENTES = ['.woff2', '.woff', '.ttf', '.otf'];

/** Archivos de fuente bajo `raiz`: ruta relativa con `/` -> contenido en base64. */
export function leerFuentes(raiz: string): Record<string, string> {
  return recorrer(
    raiz,
    (nombre) => FUENTES.some((extension) => nombre.endsWith(extension)),
    (ruta) => readFileSync(ruta).toString('base64'),
  );
}

/** Salida de `build` (todo `<raiz>/.diagrams/`, ruta relativa con `/` -> texto); lanza si no existe. */
export function leerSalida(raiz: string): Record<string, string> {
  const base = join(raiz, CARPETA_DE_SALIDA);
  statSync(base);
  return recorrer(base, () => true, (ruta) => readFileSync(ruta, 'utf8'), true);
}

/**
 * Reemplaza `<raiz>/.diagrams/<subcarpeta>` (por defecto, todo `.diagrams/`) por
 * `archivos` (ruta relativa a `.diagrams/` con `/` -> texto): la salida es
 * derivada, asi que nunca quedan restos de una Vista que ya no existe.
 */
export function escribirSalida(
  raiz: string,
  archivos: Readonly<Record<string, string | Uint8Array>>,
  subcarpeta = '',
): void {
  const destino = join(raiz, CARPETA_DE_SALIDA);
  rmSync(join(destino, subcarpeta), { recursive: true, force: true });
  for (const [ruta, texto] of Object.entries(archivos)) {
    const archivo = join(destino, ...ruta.split('/'));
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, texto);
  }
}
