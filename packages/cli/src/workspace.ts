/** Adaptador de disco: unico punto del CLI que lee el Workspace. */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
      else if (acepta(entrada.name)) archivos[relative(raiz, ruta).split(sep).join('/')] = leer(ruta);
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

const EXTENSIONES_DE_RECURSO = ['.tsx', '.ttf', '.otf', '.woff', '.woff2'];

/**
 * Recursos del Workspace que no son texto del DSL y que `dev` vigila: componentes `.tsx` de los Temas y
 * fuentes tipograficas. Devuelve ruta relativa con `/` -> hash del contenido (SHA-256), que basta para
 * saber si cambiaron. Lanza `Error` si la raiz no existe o no es una carpeta.
 */
export function leerRecursos(raiz: string): Record<string, string> {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' no es una carpeta`);
  return recorrer(raiz, (nombre) => EXTENSIONES_DE_RECURSO.some((extension) => nombre.endsWith(extension)), (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex'));
}

const TIPOS_DE_FUENTE: Readonly<Record<string, string>> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const tipoDeFuente = (ruta: string): string | undefined => TIPOS_DE_FUENTE[extname(ruta).toLowerCase()];

/** Si `ruta` es un archivo de fuente tipografica por su extension. */
export const esArchivoDeFuente = (ruta: string): boolean => tipoDeFuente(ruta) !== undefined;

/** Rutas (relativas a `raiz`, con `/`) de los archivos de fuente del Workspace: lo que `sesion` necesita para asociar familias a archivos. */
export function leerFuentes(raiz: string): string[] {
  return Object.keys(leerRecursos(raiz)).filter(esArchivoDeFuente);
}

/**
 * Contenido de la fuente `ruta` (relativa a alguna de las `raices`, la primera que la tenga) y su tipo MIME. Es el unico
 * camino por el que `dev` entrega archivos al navegador: solo extensiones de fuente, solo archivos regulares y solo
 * si, resueltos los enlaces simbolicos, siguen dentro de su raiz. Cualquier otra cosa da `undefined`.
 */
export function leerArchivoDeFuente(raices: readonly string[], ruta: string): { bytes: Buffer; tipo: string } | undefined {
  const tipo = tipoDeFuente(ruta);
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

const CARPETA_DE_SALIDA = '.diagrams';
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

/**
 * Escribe `texto` en `ruta`, creando las carpetas que falten. Atomico: escribe un temporal en
 * la misma carpeta y lo renombra, de modo que un lector (o un corte) nunca ve el archivo a medias.
 */
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

/** Ruta absoluta de `ruta` (relativa a `raiz`, con `/`); lanza si el destino queda fuera de la raiz. */
export function destinoEnWorkspace(raiz: string, ruta: string): string {
  const base = resolve(raiz);
  const destino = resolve(base, ...ruta.split('/'));
  if (ruta.startsWith('/') || isAbsolute(ruta) || !destino.startsWith(base + sep)) {
    throw new Error(`'${ruta}' queda fuera del Workspace`);
  }
  return destino;
}
