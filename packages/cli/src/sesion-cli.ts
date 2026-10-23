/**
 * Piezas comunes de los comandos que abren una `Sesion` (validate, build, skill,
 * inspect, dev): el tipo de resultado, la lectura del Workspace con `--theme-path`
 * y el texto de issues cuando la Fuente no compila.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { abrirSesion } from 'sesion';
import type { Sesion } from 'sesion';

import { compiladorDeCodigo } from './codigo';
import { leerWorkspace } from './workspace';
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
    // Los .tsx de los Temas solo se transforman (nunca se ejecutan): dan los nombres de componente y los errores de compilacion.
    // Con una lectura inyectada (pruebas) el Workspace no esta en disco: no hay `.tsx` que compilar.
    const codigo = leer === leerWorkspace ? compiladorDeCodigo(raiz).compilar() : { componentes: {}, issues: [] };
    return { sesion: abrirSesion(leerConTemas(leer, raiz, carpetaDeTemas), { ...opciones, componentes: codigo.componentes, issuesDelAdaptador: codigo.issues }) };
  } catch (error) {
    return { fallo: uso(`No se pudo leer el Workspace: ${(error as Error).message}`) };
  }
}

export const MAX_ISSUES_POR_DEFECTO = 100;

/** Issues de una Sesion sin Fuente, en texto legible (hasta `MAX_ISSUES_POR_DEFECTO`). */
export async function textoDeIssues(sesion: Sesion): Promise<string> {
  return textoLegible(construirSalida(await sesion.diagnosticar(), { maxIssues: MAX_ISSUES_POR_DEFECTO, strict: false }));
}

export { cambiosDeEdicion } from 'sesion';
