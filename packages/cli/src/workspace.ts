import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { esArchivoDeFuente, tipoDeFuente } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

/** Nombre de la carpeta de salida derivada del Workspace (build y Registro de actividad). */
export const CARPETA_DE_SALIDA = '.diagrams';

/** `<raiz>/.diagrams` */
export const carpetaDeSalida = (raiz: string): string => join(raiz, CARPETA_DE_SALIDA);

const EXTENSION = '.dg';
const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist']);

/**
 * Ruta relativa con `/` -> lo que `leer` saca de cada archivo que `acepta`. Salta carpetas ocultas
 * (`.diagrams/`), `node_modules` y `dist` salvo con `incluirOcultas`.
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

/** Archivos `.dg` y `.svg` (iconos) bajo `raiz`. Lanza si la raiz no existe o is not a folder. */
export function leerWorkspace(raiz: string): ArchivosDelWorkspace {
  if (!statSync(raiz).isDirectory()) throw new Error(`'${raiz}' is not a folder`);
  return recorrer(raiz, (nombre) => nombre.endsWith(EXTENSION) || nombre.endsWith('.svg'), (ruta) => readFileSync(ruta, 'utf8'));
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

export { esArchivoDeFuente };

/** Rutas relativas a `raiz`, con `/`. */
export function leerFuentes(raiz: string): string[] {
  return Object.keys(leerRecursos(raiz)).filter(esArchivoDeFuente);
}

/**
 * Bytes y tipo MIME de `ruta` en la primera de las `raices` que la tenga. Solo extensiones de fuente, solo archivos
 * regulares y solo si, resueltos los enlaces simbolicos, siguen dentro de su raiz; cualquier otra cosa da `undefined`.
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
