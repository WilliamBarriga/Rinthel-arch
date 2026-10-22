/**
 * `cli` — comandos `validate`, `build`, `export`, `skill`, `inspect`, `edit` y `dev`.
 *
 * Interfaz: `run(argv, dependencias?) -> { exitCode, stdout, stderr }`. No
 * escribe en el proceso: el binario (`bin.ts`) imprime el resultado.
 *
 * Invariantes: unico paquete con I/O de disco (lee Workspace, escribe en
 * `<workspace>/.diagrams/`); `validate` nunca reescribe y devuelve todos los
 * issues en una pasada, ordenados (archivo, linea, columna, codigo).
 * `validate --workspace <ruta> [--theme <nombre>] [--theme-path <carpeta>] [--json] [--max-issues N] [--strict]`:
 * - `--json`: stdout es exactamente un objeto `salidaDeValidateSchema`
 *   (ADR 0005), sin texto extra; `summary` cuenta todos los issues y
 *   `truncated` indica que `issues` se corto en `--max-issues` (100 por defecto).
 * - Codigos de salida: 0 sin errores, 1 hay errores (con `--strict`, tambien
 *   avisos), 2 fallo de uso o interno (mensaje en stderr, stdout vacio).
 * - `--theme-path` se fusiona antes del Workspace (gana el Workspace); `--theme` solo
 *   cambia las medidas con que se detectan Pins solapados, igual que en `build`.
 * - Sin errores de compilacion, calcula el layout de las Vistas con al menos dos Pins
 *   (el solape solo se conoce tras ELK) y emite `W_OVERLAPPING_PINS` como `build`; con
 *   `--strict` ese aviso hace fallar. Las Vistas sin Pins no pagan layout.
 * `build --workspace <ruta> [--theme <nombre>] [--theme-path <carpeta>]` (acepta
 * tambien `--json`, `--strict`, `--max-issues`): compila, valida y escribe en
 * `<workspace>/.diagrams/` (reemplazandola) `canonico.json` y
 * `geometria/<vista>.json` (`{ view, theme, layoutKey, geometry }`). Una Vista con
 * `theme` usa ese Tema; si no, `--theme`; si no, el neutro. `--theme-path` se
 * fusiona antes del Workspace (gana el Workspace en rutas repetidas). Con errores
 * (o avisos en `--strict`) sale 1 y borra la salida anterior; los Pins solapados salen como
 * `W_OVERLAPPING_PINS` con posicion y `related`. `--theme` inexistente: codigo 2.
 * `export --workspace <ruta> [--theme-path <carpeta>] [--format svg|png|html]` (sin `--json`, `--strict` ni
 * `--max-issues`): un SVG estatico por Vista en `.diagrams/svg/<vista>.svg`
 * (reemplaza esa carpeta), desde la salida de `build` (sin ella, o con geometria que no
 * cumple su esquema o cuya `layoutKey` no coincide con la de su Fuente canonica: codigo 2,
 * se pide ejecutar `build`; `canonico.json` y `geometria/` deben ser de la misma corrida). Mismos
 * bytes para la misma salida; el SVG no referencia recursos externos: las fuentes
 * del Tema que el Workspace trae como archivo (`<Familia>.woff2|woff|ttf|otf`)
 * van incrustadas (tambien las de `--theme-path`; gana el Workspace); los iconos son los del Workspace y los genericos.
 * Con `--format png` escribe `.diagrams/png/<vista>.png`, rasterizado con resvg (sin
 * navegador, determinista en una misma maquina): resvg no lee `@font-face`, asi que las
 * fuentes del Tema salen de `.ttf`/`.otf` del Workspace (si solo hay `woff`/`woff2`:
 * codigo 2); una familia sin archivo usa las fuentes del sistema, de modo que el
 * PNG es identico entre maquinas solo si el Workspace trae todas las familias.
 * `skill --workspace <ruta> [--out <archivo>]`: genera el skill para agentes (formato
 * `SKILL.md`) desde el catalogo del proyecto (Tipos de nodo, Paleta, Temas), la
 * sintaxis del DSL, el contrato de `validate` (JSON Schema derivado del esquema Zod)
 * y los codigos de issue. Va a stdout, o a `--out`; determinista (regenerar con otro
 * catalogo lo actualiza). Con errores de validacion sale 1 y muestra los issues.
 * Con `--format html` escribe `.diagrams/html/<vista>.html`: un archivo por Vista, sin
 * servidor ni peticiones externas, con la Fuente canonica completa, la geometria cacheada
 * de todas las Vistas, el shell (bundle de `navegador/` hecho con esbuild al exportar:
 * `VistaInteractiva` + `useEstadoEnHash` con camara), las fuentes del Tema y los iconos
 * incrustados (estatico: sin watch ni `themeUpdates`; ver la limitacion de la recarga de Tema en
 * `shell`). Abre en la Vista del archivo (el hash puede decir otra); los Nodos con
 * `link` navegan a la Vista enlazada dentro del mismo archivo. El estado por defecto sale de
 * la geometria cacheada; colapsar relayoutea con ELK en un Web Worker creado de un Blob
 * del propio bundle y, si el navegador no lo permite, en el hilo principal.
 * `inspect <buscar|nodo|vista> <argumento> --workspace <ruta> [--theme-path <carpeta>] [--json]`
 * (ADR 0005): consulta de solo lectura del Modelo, con contrato JSON propio; el contrato y los
 * codigos de salida estan en `comando-inspect.ts`.
 * `edit --workspace <ruta> (--view <id> --node <id> --x N --y N | --edits '<json>') [--hash <archivo>=<hash>] [--theme-path <carpeta>] [--json]`
 * (ADR 0005): unica escritura explicita sobre el DSL, todo o nada y con chequeo de hash; solo
 * escribe archivos del Workspace (nunca los de `--theme-path`). Contrato en `comando-edit.ts`.
 * `dev --workspace <ruta> [--port N] [--theme-path <carpeta>]` (ADR 0005): servidor en 127.0.0.1
 * (puerto 4173 por defecto) con vista previa en vivo y panel de issues. Entrada programatica:
 * `iniciarDev(OpcionesDeDev) -> ServidorDev` (`url`, `cerrar()`); invariantes, rutas y modos de
 * error en `dev.ts`. `run(['dev', ...])` convierte sus fallos en codigo 2.
 * Modos de error: issues como datos; fallo de uso -> stderr + codigo 2.
 * Configuracion requerida: `--workspace <ruta>`. Solo importa paquetes
 * anteriores en la cadena `canonico -> dsl -> layout -> sesion -> render -> shell / cli`; la tuberia compilar, validar y layout vive en `sesion`.
 */
import { salidaDeValidateSchema } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { editar } from './comando-edit';
import { inspeccionar } from './comando-inspect';
import { exportarPng, exportarSvg } from './export';
import { comandoDev } from './dev';
import { exportarHtml } from './html';
import { MAX_ISSUES_POR_DEFECTO, abrirSesionDe, textoDeIssues, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { generarSkill } from './skill';
import { construirSalida, textoLegible } from './validate';
import { leerSalidaDeBuild } from './vistas-dibujables';
import type { EntradaDeExport } from './vistas-dibujables';
import { escribirSalida, escribirTexto, leerFuentes, leerSalida, leerWorkspace } from './workspace';

export { iniciarDev } from './dev';
export type { OpcionesDeDev, ServidorDev } from './dev';

export type { ResultadoDeEjecucion };

/** Dependencias que entran como argumento; por defecto, las reales. */
export interface Dependencias {
  leer?: (raiz: string) => ArchivosDelWorkspace;
  escribir?: (raiz: string, archivos: Readonly<Record<string, string | Uint8Array>>, subcarpeta?: string) => void;
  /** Salida de `build` (`.diagrams/`), ruta relativa -> texto. */
  leerSalida?: (raiz: string) => Record<string, string>;
  /** Escribe un archivo de texto (con sus carpetas); lo usa `skill --out`. */
  escribirArchivo?: (ruta: string, texto: string) => void;
  /** Archivos de fuente del Workspace, ruta relativa -> base64. */
  leerFuentes?: (raiz: string) => Record<string, string>;
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
  if (comando === 'edit') return editar(resto, dependencias);
  if (comando === 'inspect') return inspeccionar(resto, dependencias);
  if (comando === 'dev') return comandoDev(resto, dependencias);
  if (comando !== 'validate' && comando !== 'build' && comando !== 'export' && comando !== 'skill') {
    return uso(
      `Comando desconocido '${comando ?? ''}'. Uso: diagrams <validate|build|export|skill|inspect|edit|dev> --workspace <ruta>`,
    );
  }
  if (comando === 'export') return exportar(resto, dependencias);
  if (comando === 'skill') return skill(resto, dependencias);

  let opciones: OpcionesParseadas;
  try {
    opciones = leerOpciones(resto, { theme: { type: 'string' }, 'theme-path': { type: 'string' } });
  } catch (error) {
    return uso((error as Error).message);
  }
  if (opciones['workspace'] === undefined) return uso('Falta --workspace <ruta>');
  const maxIssues = Number(opciones['max-issues'] ?? MAX_ISSUES_POR_DEFECTO);
  if (!Number.isInteger(maxIssues) || maxIssues < 1) return uso('--max-issues debe ser un entero >= 1');

  return ejecutar(comando, opciones, maxIssues, dependencias);
}

async function skill(
  args: readonly string[],
  { leer = leerWorkspace, escribirArchivo = escribirTexto }: Dependencias,
): Promise<ResultadoDeEjecucion> {
  let opciones;
  try {
    opciones = parseArgs({
      args: [...args],
      options: { workspace: { type: 'string' }, out: { type: 'string' } },
      strict: true,
    }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (opciones.workspace === undefined) return uso('Falta --workspace <ruta>');

  const abierta = abrirSesionDe(leer, opciones.workspace);
  if ('fallo' in abierta) return abierta.fallo;
  const { sesion } = abierta;
  // Sin catalogo valido no hay skill fiable: se muestran los issues, como `validate`.
  if (sesion.fuente === undefined) return { exitCode: 1, stdout: await textoDeIssues(sesion), stderr: '' };
  const texto = generarSkill(sesion.fuente);
  if (opciones.out === undefined) return { exitCode: 0, stdout: texto, stderr: '' };
  try {
    escribirArchivo(opciones.out, texto);
  } catch (error) {
    return uso(`No se pudo escribir '${opciones.out}': ${(error as Error).message}`);
  }
  return { exitCode: 0, stdout: `Skill escrito en ${opciones.out}\n`, stderr: '' };
}

/** Formatos de `export`: que dibuja, en que carpeta de `.diagrams/` y como se nombra en la salida. */
const FORMATOS: Readonly<Record<string, { exportar: (entrada: EntradaDeExport) => Record<string, string | Uint8Array> | Promise<Record<string, string | Uint8Array>>; carpeta: string; etiqueta: string }>> = {
  svg: { exportar: exportarSvg, carpeta: 'svg', etiqueta: 'SVG' },
  png: { exportar: exportarPng, carpeta: 'png', etiqueta: 'PNG' },
  html: { exportar: exportarHtml, carpeta: 'html', etiqueta: 'HTML' },
};

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
  const salida = FORMATOS[formato ?? 'svg'];
  if (salida === undefined) return uso(`Formato '${formato}' desconocido. Formatos: ${Object.keys(FORMATOS).join(', ')}`);

  let salidaDeBuild: Pick<EntradaDeExport, 'fuente' | 'geometrias'>;
  try {
    salidaDeBuild = leerSalidaDeBuild(leerCache(raiz));
  } catch (error) {
    return uso(`No hay una salida de build utilizable en '${raiz}/.diagrams' (ejecuta 'build' antes): ${(error as Error).message}`);
  }
  let archivos: Record<string, string | Uint8Array>;
  try {
    // El Workspace gana sobre `--theme-path` en rutas repetidas, como en `build`.
    const fuentes = { ...(carpetaDeTemas === undefined ? {} : leerLetras(carpetaDeTemas)), ...leerLetras(raiz) };
    archivos = await salida.exportar({ ...salidaDeBuild, workspace: leer(raiz), fuentes });
  } catch (error) {
    return uso(`No se pudo exportar: ${(error as Error).message}`);
  }
  try {
    escribir(raiz, archivos, salida.carpeta);
  } catch (error) {
    return uso(`No se pudo escribir .diagrams/${salida.carpeta}/: ${(error as Error).message}`);
  }
  return { exitCode: 0, stdout: `${Object.keys(archivos).length} ${salida.etiqueta} escritos en .diagrams/${salida.carpeta}/\n`, stderr: '' };
}

async function ejecutar(
  comando: 'validate' | 'build',
  opciones: OpcionesParseadas,
  maxIssues: number,
  { leer = leerWorkspace, escribir = escribirSalida }: Dependencias,
): Promise<ResultadoDeEjecucion> {
  const raiz = opciones['workspace'] as string;
  const carpetaDeTemas = opciones['theme-path'] as string | undefined;
  const tema = opciones['theme'] as string | undefined;
  const abierta = abrirSesionDe(leer, raiz, carpetaDeTemas, tema === undefined ? {} : { tema });
  if ('fallo' in abierta) return abierta.fallo;
  const { sesion } = abierta;

  let issues;
  let archivosDeSalida: Record<string, string> = {};
  if (sesion.fuente !== undefined && tema !== undefined && !sesion.fuente.themes.some(({ name }) => name === tema)) {
    const disponibles = sesion.fuente.themes.map(({ name }) => name).join(', ');
    return uso(`Tema '${tema}' no declarado. Disponibles: ${disponibles}`);
  }
  try {
    if (comando === 'build') {
      ({ archivos: archivosDeSalida, issues } = await sesion.construir());
    } else {
      issues = await sesion.diagnosticar();
    }
  } catch (error) {
    return uso(`Error interno al calcular la geometria: ${(error as Error).message}`);
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
