/** Adaptador de disco: unico punto del CLI que lee el Workspace. */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import type { ArchivosDelWorkspace } from 'dsl';

const EXTENSION = '.dg';
const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist']);

/**
 * Lee los archivos `.dg` y `.svg` (iconos) bajo `raiz` (recursivo, sin carpetas ocultas como
 * `.diagrams/`) y devuelve un mapa ruta relativa con `/` -> texto.
 * Lanza `Error` si la raiz no existe o no es una carpeta.
 */
export function leerWorkspace(raiz: string): ArchivosDelWorkspace {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' no es una carpeta`);
  const archivos: Record<string, string> = {};
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (entrada.name.startsWith('.') || CARPETAS_IGNORADAS.has(entrada.name)) continue;
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith(EXTENSION) || entrada.name.endsWith('.svg')) {
        archivos[ruta.slice(raiz.length + 1).split(sep).join('/')] = readFileSync(ruta, 'utf8');
      }
    }
  };
  recorrer(raiz);
  return archivos;
}

const CARPETA_DE_SALIDA = '.diagrams';
const FUENTES = ['.woff2', '.woff', '.ttf', '.otf'];

/**
 * Archivos de fuente del Workspace (mismas reglas de recorrido que `leerWorkspace`):
 * ruta relativa con `/` -> contenido en base64.
 */
export function leerFuentes(raiz: string): Record<string, string> {
  const fuentes: Record<string, string> = {};
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (entrada.name.startsWith('.') || CARPETAS_IGNORADAS.has(entrada.name)) continue;
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (FUENTES.some((extension) => entrada.name.endsWith(extension))) {
        fuentes[ruta.slice(raiz.length + 1).split(sep).join('/')] = readFileSync(ruta).toString('base64');
      }
    }
  };
  recorrer(raiz);
  return fuentes;
}

/** Salida de `build` (todo `<raiz>/.diagrams/`, ruta relativa con `/` -> texto); lanza si no existe. */
export function leerSalida(raiz: string): Record<string, string> {
  const base = join(raiz, CARPETA_DE_SALIDA);
  const archivos: Record<string, string> = {};
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else archivos[ruta.slice(base.length + 1).split(sep).join('/')] = readFileSync(ruta, 'utf8');
    }
  };
  recorrer(base);
  return archivos;
}

/**
 * Reemplaza `<raiz>/.diagrams/<subcarpeta>` (por defecto, todo `.diagrams/`) por
 * `archivos` (ruta relativa a `.diagrams/` con `/` -> texto): la salida es
 * derivada, asi que nunca quedan restos de una Vista que ya no existe.
 */
export function escribirSalida(raiz: string, archivos: Readonly<Record<string, string>>, subcarpeta = ''): void {
  const destino = join(raiz, CARPETA_DE_SALIDA);
  rmSync(join(destino, subcarpeta), { recursive: true, force: true });
  for (const [ruta, texto] of Object.entries(archivos)) {
    const archivo = join(destino, ...ruta.split('/'));
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, texto);
  }
}
