/**
 * Piezas comunes de los comandos que abren una `Sesion` (validate, build, skill,
 * inspect, dev): el tipo de resultado, la lectura del Workspace con `--theme-path`
 * y el texto de issues cuando la Fuente no compila.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { abrirSesion } from 'sesion';
import type { Sesion } from 'sesion';

import { construirSalida, textoLegible } from './validate';

export interface ResultadoDeEjecucion {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Fallo de uso o interno: codigo 2, mensaje en stderr, stdout vacio. */
export const uso = (mensaje: string): ResultadoDeEjecucion => ({ exitCode: 2, stdout: '', stderr: `${mensaje}\n` });

/** Lee el Workspace; el contenido de `--theme-path` va antes (gana el Workspace en rutas repetidas). */
export function leerConTemas(leer: (raiz: string) => ArchivosDelWorkspace, raiz: string, carpetaDeTemas?: string): ArchivosDelWorkspace {
  return { ...(carpetaDeTemas === undefined ? {} : leer(carpetaDeTemas)), ...leer(raiz) };
}

/** Abre la Sesion de un Workspace; un fallo de lectura es un fallo de uso (codigo 2). */
export function abrirSesionDe(
  leer: (raiz: string) => ArchivosDelWorkspace,
  raiz: string,
  carpetaDeTemas?: string,
  opciones: { tema?: string } = {},
): { sesion: Sesion } | { fallo: ResultadoDeEjecucion } {
  try {
    return { sesion: abrirSesion(leerConTemas(leer, raiz, carpetaDeTemas), opciones) };
  } catch (error) {
    return { fallo: uso(`No se pudo leer el Workspace: ${(error as Error).message}`) };
  }
}

export const MAX_ISSUES_POR_DEFECTO = 100;

/** Issues de una Sesion sin Fuente, en texto legible (hasta `MAX_ISSUES_POR_DEFECTO`). */
export async function textoDeIssues(sesion: Sesion): Promise<string> {
  return textoLegible(construirSalida(await sesion.diagnosticar(), { maxIssues: MAX_ISSUES_POR_DEFECTO, strict: false }));
}

/**
 * Archivos que cambia una edicion aplicada (ordenados) y, si hay, el primero que no pertenece al
 * Workspace (viene de `--theme-path`): `edit` y `dev` solo escriben en la raiz del Workspace.
 */
export function cambiosDeEdicion(
  antes: ArchivosDelWorkspace,
  despues: ArchivosDelWorkspace,
  propios: ArchivosDelWorkspace,
): { cambiados: string[]; fuera: string | undefined } {
  const cambiados = Object.keys(despues)
    .filter((f) => despues[f] !== antes[f])
    .sort();
  return { cambiados, fuera: cambiados.find((f) => !(f in propios)) };
}
