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

/**
 * Reemplaza `<raiz>/.diagrams/` por `archivos` (ruta relativa con `/` -> texto):
 * la salida es derivada, asi que nunca quedan restos de una Vista que ya no existe.
 */
export function escribirSalida(raiz: string, archivos: Readonly<Record<string, string>>): void {
  const destino = join(raiz, CARPETA_DE_SALIDA);
  rmSync(destino, { recursive: true, force: true });
  for (const [ruta, texto] of Object.entries(archivos)) {
    const archivo = join(destino, ...ruta.split('/'));
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, texto);
  }
}
