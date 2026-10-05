/**
 * `cli` — comandos `validate`, `build` y `export`.
 *
 * Interfaz: `run(argv, dependencias?) -> { exitCode, stdout, stderr }`. No
 * escribe en el proceso: el binario (`bin.ts`) imprime el resultado.
 *
 * Invariantes: unico paquete con I/O de disco (lee Workspace, escribe en
 * `<workspace>/.diagrams/`); `validate` nunca reescribe y devuelve todos los
 * issues en una pasada, ordenados (archivo, linea, columna, codigo).
 * `validate --workspace <ruta> [--json] [--max-issues N] [--strict]`:
 * - `--json`: stdout es exactamente un objeto `salidaDeValidateSchema`
 *   (ADR 0008), sin texto extra; `summary` cuenta todos los issues y
 *   `truncated` indica que `issues` se corto en `--max-issues` (100 por defecto).
 * - Codigos de salida: 0 sin errores, 1 hay errores (con `--strict`, tambien
 *   avisos), 2 fallo de uso o interno (mensaje en stderr, stdout vacio).
 * `build --workspace <ruta> [--theme <nombre>] [--theme-path <carpeta>]` (acepta
 * tambien `--json`, `--strict`, `--max-issues`): compila, valida y escribe en
 * `<workspace>/.diagrams/` (reemplazandola) `canonico.json` y
 * `geometria/<vista>.json` (`{ view, theme, layoutKey, geometry }`). Una Vista con
 * `theme` usa ese Tema; si no, `--theme`; si no, el neutro. `--theme-path` se
 * fusiona antes del Workspace (gana el Workspace en rutas repetidas). Con errores
 * (o avisos en `--strict`) sale 1 y borra la salida anterior; los Pins solapados salen como
 * `W_OVERLAPPING_PINS` con posicion y `related`. `--theme` inexistente: codigo 2.
 * `export --workspace <ruta> [--theme-path <carpeta>] [--format svg|png]` (sin `--json`, `--strict` ni
 * `--max-issues`): un SVG estatico por Vista en `.diagrams/svg/<vista>.svg`
 * (reemplaza esa carpeta), desde la salida de `build` (sin ella: codigo 2). Mismos
 * bytes para la misma salida; el SVG no referencia recursos externos: las fuentes
 * del Tema que el Workspace trae como archivo (`<Familia>.woff2|woff|ttf|otf`)
 * van incrustadas (tambien las de `--theme-path`; gana el Workspace); los iconos son los del Workspace y los genericos.
 * Con `--format png` escribe `.diagrams/png/<vista>.png`, rasterizado con resvg (sin
 * navegador, determinista en una misma maquina): resvg no lee `@font-face`, asi que las
 * fuentes del Tema salen de `.ttf`/`.otf` del Workspace (si solo hay `woff`/`woff2`:
 * codigo 2); una familia sin archivo usa las fuentes del sistema, de modo que el
 * PNG es identico entre maquinas solo si el Workspace trae todas las familias.
 * Modos de error: issues como datos; fallo de uso -> stderr + codigo 2.
 * Configuracion requerida: `--workspace <ruta>`. Solo importa paquetes
 * anteriores en la cadena `canonico -> dsl -> layout -> render -> shell / cli`.
 */
import { fuenteCanonicaSchema, salidaDeValidateSchema } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace, ResultadoDeCompilacion } from 'dsl';
import { parseArgs } from 'node:util';

import { construirBuild } from './build';
import type { GeometriaCacheada } from './build';
import { exportarPng, exportarSvg } from './export';

import { construirSalida, textoLegible } from './validate';
import { escribirSalida, leerFuentes, leerSalida, leerWorkspace } from './workspace';

export const paquete = 'cli';

export interface ResultadoDeEjecucion {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Dependencias que entran como argumento; por defecto, las reales. */
export interface Dependencias {
  compilar?: (workspace: ArchivosDelWorkspace) => ResultadoDeCompilacion;
  leer?: (raiz: string) => ArchivosDelWorkspace;
  escribir?: (raiz: string, archivos: Readonly<Record<string, string | Uint8Array>>, subcarpeta?: string) => void;
  /** Salida de `build` (`.diagrams/`), ruta relativa -> texto. */
  leerSalida?: (raiz: string) => Record<string, string>;
  /** Archivos de fuente del Workspace, ruta relativa -> base64. */
  leerFuentes?: (raiz: string) => Record<string, string>;
}

const MAX_ISSUES_POR_DEFECTO = 100;

function uso(mensaje: string): ResultadoDeEjecucion {
  return { exitCode: 2, stdout: '', stderr: `${mensaje}\n` };
}

type OpcionesParseadas = ReturnType<typeof leerOpciones>;

const OPCIONES_COMUNES = {
  workspace: { type: 'string' },
  json: { type: 'boolean', default: false },
  strict: { type: 'boolean', default: false },
  'max-issues': { type: 'string' },
} as const;

function leerOpciones(args: readonly string[], propias: Record<string, { type: 'string' }> = {}) {
  return parseArgs({
    args: [...args],
    options: { ...OPCIONES_COMUNES, ...propias },
    strict: true,
  }).values as Record<string, string | boolean | undefined>;
}

export async function run(
  argv: readonly string[],
  dependencias: Dependencias = {},
): Promise<ResultadoDeEjecucion> {
  const [comando, ...resto] = argv;
  if (comando !== 'validate' && comando !== 'build' && comando !== 'export') {
    return uso(
      `Comando desconocido '${comando ?? ''}'. Uso: diagrams <validate|build|export> --workspace <ruta>`,
    );
  }
  if (comando === 'export') return exportar(resto, dependencias);

  let opciones: OpcionesParseadas;
  try {
    opciones = leerOpciones(resto, comando === 'build' ? { theme: { type: 'string' }, 'theme-path': { type: 'string' } } : {});
  } catch (error) {
    return uso((error as Error).message);
  }
  if (opciones['workspace'] === undefined) return uso('Falta --workspace <ruta>');
  const maxIssues = Number(opciones['max-issues'] ?? MAX_ISSUES_POR_DEFECTO);
  if (!Number.isInteger(maxIssues) || maxIssues < 1) return uso('--max-issues debe ser un entero >= 1');

  return ejecutar(comando, opciones, maxIssues, dependencias);
}

async function exportar(
  args: readonly string[],
  { leer = leerWorkspace, leerSalida: leerCache = leerSalida, leerFuentes: leerLetras = leerFuentes, escribir = escribirSalida }: Dependencias,
): Promise<ResultadoDeEjecucion> {
  let raiz: string | undefined;
  let carpetaDeTemas: string | undefined;
  let formato: string | undefined;
  try {
    ({ workspace: raiz, 'theme-path': carpetaDeTemas, format: formato } = parseArgs({
      args: [...args],
      options: { workspace: { type: 'string' }, 'theme-path': { type: 'string' }, format: { type: 'string' } },
      strict: true,
    }).values);
  } catch (error) {
    return uso((error as Error).message);
  }
  if (raiz === undefined) return uso('Falta --workspace <ruta>');
  if (formato !== undefined && formato !== 'svg' && formato !== 'png') {
    return uso(`Formato '${formato}' desconocido. Formatos: svg, png`);
  }
  const esPng = formato === 'png';

  let archivos: Record<string, string | Uint8Array>;
  try {
    const cache = leerCache(raiz);
    const fuente = fuenteCanonicaSchema.parse(JSON.parse(cache['canonico.json'] ?? 'null'));
    const geometrias = Object.fromEntries(
      Object.entries(cache)
        .filter(([ruta]) => ruta.startsWith('geometria/'))
        .map(([, texto]) => {
          const cacheada = JSON.parse(texto) as GeometriaCacheada;
          return [cacheada.view, cacheada] as const;
        }),
    );
    // El Workspace gana sobre `--theme-path` en rutas repetidas, como en `build`.
    const fuentes = { ...(carpetaDeTemas === undefined ? {} : leerLetras(carpetaDeTemas)), ...leerLetras(raiz) };
    archivos = (esPng ? exportarPng : exportarSvg)(fuente, geometrias, leer(raiz), fuentes);
  } catch (error) {
    return uso(`No hay una salida de build utilizable en '${raiz}/.diagrams' (ejecuta 'build' antes): ${(error as Error).message}`);
  }
  try {
    escribir(raiz, archivos, esPng ? 'png' : 'svg');
  } catch (error) {
    return uso(`No se pudo escribir .diagrams/${esPng ? 'png' : 'svg'}/: ${(error as Error).message}`);
  }
  return { exitCode: 0, stdout: `${Object.keys(archivos).length} ${esPng ? 'PNG' : 'SVG'} escritos en .diagrams/${esPng ? 'png' : 'svg'}/\n`, stderr: '' };
}

async function ejecutar(
  comando: 'validate' | 'build',
  opciones: OpcionesParseadas,
  maxIssues: number,
  { compilar = compile, leer = leerWorkspace, escribir = escribirSalida }: Dependencias,
): Promise<ResultadoDeEjecucion> {
  const raiz = opciones['workspace'] as string;
  const carpetaDeTemas = opciones['theme-path'] as string | undefined;
  let resultado: ResultadoDeCompilacion;
  try {
    // El Workspace gana sobre `--theme-path` en caso de ruta repetida.
    const archivos = { ...(carpetaDeTemas === undefined ? {} : leer(carpetaDeTemas)), ...leer(raiz) };
    resultado = compilar(archivos);
  } catch (error) {
    return uso(`No se pudo leer el Workspace: ${(error as Error).message}`);
  }

  const issues = [...resultado.issues];
  const archivosDeSalida: Record<string, string> = {};
  if (comando === 'build' && resultado.canonico !== undefined) {
    const tema = opciones['theme'] as string | undefined;
    if (tema !== undefined && !resultado.canonico.themes.some(({ name }) => name === tema)) {
      const disponibles = resultado.canonico.themes.map(({ name }) => name).join(', ');
      return uso(`Tema '${tema}' no declarado. Disponibles: ${disponibles}`);
    }
    try {
      const { archivos, issues: avisos } = await construirBuild(resultado.canonico, {
        ...(tema !== undefined && { tema }),
        pins: resultado.pins,
      });
      Object.assign(archivosDeSalida, archivos);
      issues.push(...avisos);
    } catch (error) {
      return uso(`Error interno al calcular la geometria: ${(error as Error).message}`);
    }
  }

  let salida;
  try {
    salida = salidaDeValidateSchema.parse(
      construirSalida(issues, { maxIssues, strict: opciones['strict'] === true }),
    );
  } catch (error) {
    return uso(`Error interno: la salida no cumple el contrato (${(error as Error).message})`);
  }
  if (comando === 'build') {
    // Un build fallido borra la salida anterior: `export` no debe dibujar algo obsoleto.
    try {
      escribir(raiz, salida.ok ? archivosDeSalida : {});
    } catch (error) {
      return uso(`No se pudo escribir .diagrams/: ${(error as Error).message}`);
    }
  }
  return {
    exitCode: salida.ok ? 0 : 1,
    stdout: opciones['json'] === true ? `${JSON.stringify(salida, null, 2)}\n` : textoLegible(salida),
    stderr: '',
  };
}
