/**
 * Registro de actividad (ADR 0005): unico punto del CLI que arma el Evento de actividad de `validate`, `build`,
 * `inspect` y `edit`, salgan como salgan, y lo anexa con `registro-en-disco.ts` (dueno del archivo y de su rotacion).
 * Invariantes: un Evento por comando. Sin `--workspace` que resuelva a una carpeta no se registra.
 * Modos de error: ninguno visible; un fallo al escribir se ignora y no cambia stdout, stderr ni el codigo.
 */
import { ACTIVIDAD_CONTRACT_VERSION, COMANDOS_CON_ACTIVIDAD } from 'canonico';
import type { EventoDeActividad, ObjetivoDeActividad } from 'canonico';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { anexarAlRegistro } from './registro-en-disco';
import type { ResultadoDeEjecucion } from './sesion-cli';

/** Lo que el comando nombra y, en `validate` y `build`, el recuento de issues. */
export interface DatosDeActividad {
  target?: ObjetivoDeActividad;
  summary?: { errors: number; warnings: number };
}

/** Un comando que registra devuelve, ademas, sus datos de actividad; `run` los quita antes de responder. */
export type ResultadoConActividad = ResultadoDeEjecucion & { actividad?: DatosDeActividad };

export type Entorno = Readonly<Record<string, string | undefined>>;

const registra = (comando: string | undefined): comando is EventoDeActividad['command'] =>
  (COMANDOS_CON_ACTIVIDAD as readonly string[]).includes(comando ?? '');

/** Valor de `--workspace <ruta>` o `--workspace=<ruta>`, como lo leeria `parseArgs`. */
function workspaceDe(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--') return undefined;
    if (arg === '--workspace') return args[i + 1];
    if (arg.startsWith('--workspace=')) return arg.slice('--workspace='.length);
  }
  return undefined;
}

function carpetaDe(args: readonly string[]): string | undefined {
  const workspace = workspaceDe(args);
  if (workspace === undefined) return undefined;
  try {
    return statSync(workspace).isDirectory() ? resolve(workspace) : undefined;
  } catch {
    return undefined;
  }
}

/** Corre `ejecutar` y, si `argv` es de un comando que registra, anexa su Evento. Devuelve el resultado sin los datos. */
export async function conActividad(
  argv: readonly string[],
  entorno: Entorno,
  ejecutar: () => Promise<ResultadoConActividad>,
): Promise<ResultadoDeEjecucion> {
  const inicio = Date.now();
  const { actividad, ...resultado } = await ejecutar();
  const [comando, ...args] = argv;
  if (!registra(comando) || entorno['DIAGRAMS_ACTIVITY'] === '0') return resultado;
  const carpeta = carpetaDe(args);
  if (carpeta === undefined) return resultado;
  const agente = entorno['DIAGRAMS_AGENT'];
  const evento: EventoDeActividad = {
    contractVersion: ACTIVIDAD_CONTRACT_VERSION,
    ts: new Date(inicio).toISOString(),
    pid: process.pid,
    ...(agente !== undefined && agente !== '' && { agent: agente }),
    command: comando,
    args,
    exitCode: resultado.exitCode,
    durationMs: Date.now() - inicio,
    ...(actividad?.target !== undefined && Object.keys(actividad.target).length > 0 && { target: actividad.target }),
    ...(actividad?.summary !== undefined && { summary: actividad.summary }),
  };
  try {
    anexarAlRegistro(carpeta, `${JSON.stringify(evento)}\n`);
  } catch {
    // El registro es un rastro auxiliar: nunca altera la salida del comando.
  }
  return resultado;
}
