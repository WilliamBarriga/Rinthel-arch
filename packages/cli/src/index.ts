/**
 * `cli`: comandos `validate`, `build`, `skill`, `inspect`, `edit` y `dev` (opciones: `docs/guia/cli.md`).
 * Interfaz: `run(argv, dependencias?) -> { exitCode, stdout, stderr }`; no escribe en el proceso (`bin.ts` imprime).
 * Invariantes: unico paquete con I/O de disco; `validate` nunca reescribe y devuelve todos los issues ordenados;
 * su unico efecto lateral es el Registro de actividad en `.diagrams/actividad.jsonl`.
 * Modos de error: issues como datos; fallo de uso o interno -> stderr, stdout vacio, codigo 2.
 * Codigos de salida: 0 correcto, 1 errores del Workspace o edicion rechazada, 2 fallo de uso o interno.
 */
import { salidaDeValidateSchema } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { conActividad } from './actividad';
import type { Entorno, ResultadoConActividad } from './actividad';
import { ayudaPara } from './ayuda';
import { editar } from './comando-edit';
import { inspeccionar } from './comando-inspect';
import { comandoDev } from './dev';
import { MAX_ISSUES_POR_DEFECTO, abrirSesionDe, textoDeIssues, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { generarSkill } from './skill';
import { construirSalida, textoLegible } from './validate';
import { CARPETA_DE_SALIDA, escribirSalida, escribirTexto, leerWorkspace } from './workspace';

export { iniciarDev } from './dev';
export { CARPETA_DE_SALIDA } from './workspace';
export type { OpcionesDeDev, ServidorDev } from './dev';

export type { ResultadoDeEjecucion };

/** Por defecto, las reales. */
export interface Dependencias {
  leer?: (raiz: string) => ArchivosDelWorkspace;
  escribir?: (raiz: string, archivos: Readonly<Record<string, string | Uint8Array>>, subcarpeta?: string) => void;
  /** Crea las carpetas que falten. */
  escribirArchivo?: (ruta: string, texto: string) => void;
  /** Variables `DIAGRAMS_ACTIVIDAD` y `DIAGRAMS_AGENTE` del Registro de actividad; por defecto `process.env`. */
  entorno?: Entorno;
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

/**
 * `--help`, `-h`, `help [comando]` o sin argumentos dan el uso (codigo 0). `validate` y `build` salen 1 con errores
 * (con `--strict`, tambien con avisos); `--json` imprime exactamente un objeto `salidaDeValidateSchema`.
 * `build` reemplaza `canonico.json` y `geometria/` en `<workspace>/.diagrams/` y, si falla, los borra. `validate`,
 * `build`, `inspect` y `edit` anexan un Evento al Registro de actividad (`actividad.ts`), salvo `DIAGRAMS_ACTIVIDAD=0`. Un `--theme` no declarado,
 * un comando desconocido o una opcion invalida salen 2. Los `.tsx` de Temas se compilan sin ejecutarse.
 */
export async function run(
  argv: readonly string[],
  dependencias: Dependencias = {},
): Promise<ResultadoDeEjecucion> {
  const ayuda = ayudaPara(argv);
  if (ayuda !== undefined) return { exitCode: 0, stdout: ayuda, stderr: '' };
  return conActividad(argv, dependencias.entorno ?? process.env, () => despachar(argv, dependencias));
}

async function despachar(argv: readonly string[], dependencias: Dependencias): Promise<ResultadoConActividad> {
  const [comando, ...resto] = argv;
  if (comando === 'edit') return editar(resto, dependencias);
  if (comando === 'inspect') return inspeccionar(resto, dependencias);
  if (comando === 'dev') return comandoDev(resto);
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
): Promise<ResultadoConActividad> {
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
    // Un build fallido borra la salida anterior para no dejar geometria obsoleta.
    try {
      escribir(raiz, salida.ok ? archivosDeSalida : {});
    } catch (error) {
      return uso(`No se pudo escribir ${CARPETA_DE_SALIDA}/: ${(error as Error).message}`);
    }
  }
  return {
    exitCode: salida.ok ? 0 : 1,
    stdout: opciones['json'] === true ? `${JSON.stringify(salida, null, 2)}\n` : textoLegible(salida),
    stderr: '',
    actividad: { resumen: { errores: salida.summary.errors, avisos: salida.summary.warnings } },
  };
}
