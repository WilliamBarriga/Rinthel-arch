/**
 * `check-dependencies` — chequeo automatizado de la arquitectura del workspace.
 *
 * Interfaz publica:
 * - `CADENA`: orden de dependencias de ADR 0005, fuente unica de verdad.
 * - `revisarWorkspace(raiz) -> Violacion[]`: escanea `packages/*` (fuente,
 *   tests, configs y `package.json`) y devuelve las violaciones en orden
 *   determinista (paquete, archivo, regla, mensaje). Vacio significa verde.
 *
 * Reglas:
 * - `cadena`: el paquete existe en `packages/` y su nombre esta en `CADENA`.
 * - `orden`: solo se importa de paquetes anteriores en `CADENA`.
 * - `interno`: lo unico importable de otro paquete es su nombre y lo que
 *   declara `exports`; un import relativo no puede salir del propio paquete.
 * - `declaracion`: todo paquete del workspace importado se declara en
 *   `dependencies` o `peerDependencies`.
 * - `exports`: la superficie publica es exactamente la entrada raiz `.`.
 * - `pureza`: los paquetes de `NUCLEO` no importan modulos de Node ni usan
 *   reloj, azar, `process`, red ni DOM en su codigo fuente (los tests quedan fuera).
 *
 * Invariantes:
 * - Lee archivos, no modifica nada; las dependencias externas (no son del
 *   workspace) se ignoran, salvo las reglas anteriores.
 * - Los comentarios se ignoran: solo cuentan los import escritos en codigo.
 * - Determinista: misma entrada, misma lista de violaciones.
 *
 * Modos de error:
 * - Un `package.json` ilegible o con JSON invalido lanza `Error`; es un fallo
 *   de uso del chequeo, no una violacion de arquitectura.
 * - Un `package.json` ausente en una carpeta de `packages/` se ignora.
 */
import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Orden de dependencias (ADR 0005): un paquete solo importa de los anteriores. */
export const CADENA = ['canonico', 'dsl', 'layout', 'sesion', 'render', 'shell', 'cli'] as const;

/** Nucleo puro (CODING.md): sin I/O, sin reloj, sin estado global. layout, shell y cli son adaptadores. */
export const NUCLEO = ['canonico', 'dsl', 'sesion', 'render'] as const;

const IMPUREZAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/, 'reloj'],
  [/\bMath\.random\b|\bcrypto\.(?:randomUUID|getRandomValues)\b/, 'azar'],
  [/\bprocess\.|\bglobalThis\b/, 'estado global del proceso'],
  [/\bfetch\(|\bXMLHttpRequest\b|\bnew Worker\b/, 'red o workers'],
  [/\b(?:window|document|localStorage|sessionStorage)\./, 'DOM'],
];

const MODULOS_DE_NODE = new Set(builtinModules);

export type Regla = 'cadena' | 'orden' | 'interno' | 'declaracion' | 'exports' | 'pureza';

export interface Violacion {
  readonly paquete: string;
  readonly archivo: string;
  readonly regla: Regla;
  readonly mensaje: string;
}

interface Manifiesto {
  readonly name?: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface Paquete {
  readonly nombre: string;
  readonly carpeta: string;
  readonly manifiesto: Manifiesto;
}

const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const ARCHIVOS_IGNORADOS = /^tsup\.config\.|^vitest\.config\./;
const EXTENSIONES_DE_CODIGO = ['.ts', '.tsx', '.mts', '.cts'];
const RE_ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

export function revisarWorkspace(raiz: string): Violacion[] {
  const paquetes = cargarPaquetes(raiz);
  const violaciones: Violacion[] = [];
  for (const paquete of paquetes) {
    violaciones.push(...revisarManifiesto(paquete));
    for (const archivo of archivosDe(paquete.carpeta)) {
      violaciones.push(...revisarArchivo(raiz, paquete, archivo, paquetes));
    }
  }
  return violaciones;
}

function cargarPaquetes(raiz: string): Paquete[] {
  let entradas: string[];
  try {
    entradas = readdirSync(join(raiz, 'packages'));
  } catch {
    return [];
  }
  const paquetes: Paquete[] = [];
  for (const entrada of entradas.sort()) {
    const carpeta = join(raiz, 'packages', entrada);
    let texto: string;
    try {
      texto = readFileSync(join(carpeta, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    paquetes.push({
      nombre: entrada,
      carpeta,
      manifiesto: JSON.parse(texto) as Manifiesto,
    });
  }
  return paquetes;
}

function revisarManifiesto(paquete: Paquete): Violacion[] {
  const violaciones: Violacion[] = [];
  const nombre = paquete.manifiesto.name ?? paquete.nombre;
  const archivo = 'package.json';
  if (!(CADENA as readonly string[]).includes(nombre)) {
    violaciones.push({
      paquete: nombre,
      archivo,
      regla: 'cadena',
      mensaje: `paquete fuera de la cadena declarada (${CADENA.join(' -> ')}); anadelo a CADENA o renombralo`,
    });
  }
  const claves = clavesDeExports(paquete.manifiesto);
  if (claves.length !== 1 || claves[0] !== '.') {
    violaciones.push({
      paquete: nombre,
      archivo,
      regla: 'exports',
      mensaje: `exports debe declarar solo la entrada raiz "."; declarado: ${
        claves.length > 0 ? claves.join(', ') : '(ausente)'
      }`,
    });
  }
  return violaciones;
}

function revisarArchivo(
  raiz: string,
  paquete: Paquete,
  archivo: string,
  paquetes: Paquete[],
): Violacion[] {
  const nombre = paquete.manifiesto.name ?? paquete.nombre;
  const texto = sinComentarios(readFileSync(archivo, 'utf8'));
  const relativo = relative(raiz, archivo);
  const violaciones: Violacion[] = [];

  const esNucleo = (NUCLEO as readonly string[]).includes(nombre) && !esDeTest(relativo);
  if (esNucleo) {
    for (const [patron, causa] of IMPUREZAS) {
      if (patron.test(texto)) {
        violaciones.push({
          paquete: nombre,
          archivo: relativo,
          regla: 'pureza',
          mensaje: `el nucleo no usa ${causa}; recibelo como argumento o muevelo a un adaptador`,
        });
      }
    }
  }

  for (const especificador of extraerEspecificadores(texto)) {
    if (esNucleo && (especificador.startsWith('node:') || MODULOS_DE_NODE.has(especificador))) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'pureza',
        mensaje: `el nucleo no importa "${especificador}" (I/O); recibelo como puerto desde un adaptador`,
      });
    }
    if (especificador.startsWith('.')) {
      const destino = resolve(dirname(archivo), especificador);
      const dueno = paquetes.find((otro) => dentroDe(destino, otro.carpeta));
      if (dueno === undefined || dueno.nombre !== paquete.nombre) {
        violaciones.push({
          paquete: nombre,
          archivo: relativo,
          regla: 'interno',
          mensaje: `import relativo "${especificador}" sale de ${nombre}; otro paquete se importa por su nombre`,
        });
      }
      continue;
    }

    const importado = nombreDePaquete(especificador);
    const destino = paquetes.find((otro) => otro.nombre === importado);
    if (destino === undefined) {
      continue;
    }

    const mia = (CADENA as readonly string[]).indexOf(nombre);
    const suya = (CADENA as readonly string[]).indexOf(importado);
    if (mia >= 0 && suya > mia) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'orden',
        mensaje: `${nombre} importa de ${importado}, que esta despues en la cadena (${CADENA.join(' -> ')})`,
      });
    }

    const subpath = especificador.slice(importado.length);
    if (subpath !== '' && !clavesDeExports(destino.manifiesto).includes(`.${subpath}`)) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'interno',
        mensaje: `importa "${especificador}"; de ${importado} solo se importa por nombre y por lo que declara su exports`,
      });
    }

    const declaradas = {
      ...paquete.manifiesto.dependencies,
      ...paquete.manifiesto.peerDependencies,
    };
    if (importado !== nombre && !(importado in declaradas)) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'declaracion',
        mensaje: `importa ${importado} sin declararlo en dependencies o peerDependencies`,
      });
    }
  }

  return violaciones;
}

function esDeTest(ruta: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(ruta) || /\.(test|spec)\.[cm]?tsx?$/.test(ruta);
}

function clavesDeExports(manifiesto: Manifiesto): string[] {
  const exports = manifiesto.exports;
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) {
    return [];
  }
  return Object.keys(exports);
}

function nombreDePaquete(especificador: string): string {
  const partes = especificador.split('/');
  if (especificador.startsWith('@')) {
    return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : especificador;
  }
  return partes[0];
}

function dentroDe(ruta: string, carpeta: string): boolean {
  const rel = relative(carpeta, ruta);
  return rel === '' || (!rel.startsWith('..') && rel !== '..' && !rel.startsWith(`..${'/'}`));
}

function archivosDe(carpeta: string): string[] {
  const encontrados: string[] = [];
  const pendientes = [carpeta];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const entrada of readdirSync(actual, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (!CARPETAS_IGNORADAS.has(entrada.name)) {
          pendientes.push(ruta);
        }
      } else if (
        entrada.isFile() &&
        EXTENSIONES_DE_CODIGO.some((extension) => entrada.name.endsWith(extension)) &&
        !entrada.name.endsWith('.d.ts') &&
        !ARCHIVOS_IGNORADOS.test(entrada.name)
      ) {
        encontrados.push(ruta);
      }
    }
  }
  return encontrados.sort();
}

function extraerEspecificadores(texto: string): string[] {
  const especificadores: string[] = [];
  for (const coincidencia of texto.matchAll(RE_ESPECIFICADOR)) {
    especificadores.push(coincidencia[2]);
  }
  return especificadores;
}

/** Strings -> placeholders, regex elimina comentarios, placeholders -> strings. */
function sinComentarios(texto: string): string {
  const placeholders: string[] = [];
  const conPlaceholders = texto
    .replace(/(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]*`)/g, (
      match,
    ) => `__STR${placeholders.push(match) - 1}__`);
  const sinComentarios = conPlaceholders
    .replace(/\/\/.*$/gm, '  ')
    .replace(/\/\*[\s\S]*?\*\//g, '  ');
  return sinComentarios.replace(/__STR(\d+)__/g, (_, i) => placeholders[Number(i)]);
}
