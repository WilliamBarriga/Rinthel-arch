/**
 * `cli` — comandos `validate`, `build`, `skill`, `inspect`, `edit` y `dev`.
 *
 * Interfaz: `run(argv, dependencias?) -> { exitCode, stdout, stderr }`. No
 * escribe en el proceso: el binario (`bin.ts`) imprime el resultado.
 *
 * Invariantes: unico paquete con I/O de disco (lee Workspace, escribe en
 * `<workspace>/.diagrams/`); `validate` nunca reescribe y devuelve todos los
 * issues en una pasada, ordenados (archivo, linea, columna, codigo).
 * Ayuda (`ayuda.ts`): `--help`, `-h`, `help [comando]` o sin argumentos imprimen el uso a stdout con codigo 0.
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
 * `skill --workspace <ruta> [--out <archivo>]`: genera el skill para agentes (formato
 * `SKILL.md`) desde el catalogo del proyecto (Tipos de nodo, Paleta, Temas), la
 * sintaxis del DSL, el contrato de `validate` (JSON Schema derivado del esquema Zod)
 * y los codigos de issue. Va a stdout, o a `--out`; determinista (regenerar con otro
 * catalogo lo actualiza). Con errores de validacion sale 1 y muestra los issues.
 * `inspect <buscar|nodo|vista> <argumento> --workspace <ruta> [--theme-path <carpeta>] [--json]`
 * (ADR 0005): consulta de solo lectura del Modelo, con contrato JSON propio; el contrato y los
 * codigos de salida estan en `comando-inspect.ts`.
 * `edit --workspace <ruta> (--view <id> --node <id> --x N --y N | --edits '<json>') [--hash <archivo>=<hash>] [--theme-path <carpeta>] [--json]`
 * (ADR 0005): unica escritura explicita sobre el DSL, todo o nada y con chequeo de hash; solo
 * escribe archivos del Workspace (nunca los de `--theme-path`). Contrato en `comando-edit.ts`.
 * `dev --workspace <ruta> [--port N] [--theme-path <carpeta>] [--trust-code]` (ADR 0005): servidor en 127.0.0.1
 * (puerto 4173 por defecto) con vista previa en vivo y panel de issues. Entrada programatica:
 * `iniciarDev(OpcionesDeDev) -> ServidorDev` (`url`, `cerrar()`); invariantes, rutas y modos de
 * error en `dev.ts`. `run(['dev', ...])` convierte sus fallos en codigo 2.
 * Temas con codigo (ADR 0008): `src/codigo.ts` compila con esbuild, sin ejecutar, los `.tsx` del Workspace; `validate`, `build` e
 * `inspect` reciben de el los nombres de componente y los errores de compilacion (`E_THEME_CODE_COMPILE` con file/line),
 * e `inspect tema` marca `temaConCodigo`. `dev` sirve el bundle en `/componentes.js` solo tras la confirmacion
 * (`POST /api/confiar` o `--trust-code`) y conserva la ultima version buena de cada `.tsx`.
 * Modos de error: issues como datos; fallo de uso -> stderr + codigo 2.
 * Configuracion requerida: `--workspace <ruta>`. Solo importa paquetes
 * anteriores en la cadena `canonico -> tema -> dsl -> layout -> sesion -> render -> shell / cli`; la tuberia compilar, validar y layout vive en `sesion`.
 */
import { salidaDeValidateSchema } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { ayudaPara } from './ayuda';
import { editar } from './comando-edit';
import { inspeccionar } from './comando-inspect';
import { comandoDev } from './dev';
import { MAX_ISSUES_POR_DEFECTO, abrirSesionDe, textoDeIssues, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { generarSkill } from './skill';
import { construirSalida, textoLegible } from './validate';
import { escribirSalida, escribirTexto, leerWorkspace } from './workspace';

export { iniciarDev } from './dev';
export type { OpcionesDeDev, ServidorDev } from './dev';

export type { ResultadoDeEjecucion };

/** Dependencias que entran como argumento; por defecto, las reales. */
export interface Dependencias {
  leer?: (raiz: string) => ArchivosDelWorkspace;
  escribir?: (raiz: string, archivos: Readonly<Record<string, string | Uint8Array>>, subcarpeta?: string) => void;
  /** Escribe un archivo de texto (con sus carpetas); lo usa `skill --out`. */
  escribirArchivo?: (ruta: string, texto: string) => void;
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
  const ayuda = ayudaPara(argv);
  if (ayuda !== undefined) return { exitCode: 0, stdout: ayuda, stderr: '' };
  const [comando, ...resto] = argv;
  if (comando === 'edit') return editar(resto, dependencias);
  if (comando === 'inspect') return inspeccionar(resto, dependencias);
  if (comando === 'dev') return comandoDev(resto, dependencias);
  if (comando !== 'validate' && comando !== 'build' && comando !== 'skill') {
    return uso(
      `Comando desconocido '${comando ?? ''}'. Uso: diagrams <validate|build|skill|inspect|edit|dev> --workspace <ruta> (diagrams --help para el detalle)`,
    );
  }
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
    // Un build fallido borra la salida anterior: no debe quedar geometria obsoleta.
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
