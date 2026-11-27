import type { ArchivosDelWorkspace } from 'dsl';
import { openSession } from 'session';
import type { Session } from 'session';

import { compiladorDeCodigo } from './codigo';
import { leerFuentes, leerWorkspace } from './workspace';
import { construirSalida, textoLegible } from './validate';

export interface ResultadoDeEjecucion {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Fallo de uso o interno: codigo 2, mensaje en stderr, stdout vacio. */
export const uso = (mensaje: string): ResultadoDeEjecucion => ({ exitCode: 2, stdout: '', stderr: `${mensaje}\n` });

/** El contenido de `--theme-path` va antes: gana el Workspace en rutas repetidas. */
export function leerConTemas(leer: (raiz: string) => ArchivosDelWorkspace, raiz: string, carpetaDeTemas?: string): ArchivosDelWorkspace {
  return { ...(carpetaDeTemas === undefined ? {} : leer(carpetaDeTemas)), ...leer(raiz) };
}

/** Un fallo de lectura es un fallo de uso (codigo 2). */
export function abrirSesionDe(
  leer: (raiz: string) => ArchivosDelWorkspace,
  raiz: string,
  carpetaDeTemas?: string,
  opciones: { tema?: string } = {},
): { sesion: Session } | { fallo: ResultadoDeEjecucion } {
  try {
    // Con una lectura inyectada el Workspace no esta en disco: no hay `.tsx` ni fuentes que leer.
    const enDisco = leer === leerWorkspace;
    const codigo = enDisco ? compiladorDeCodigo(raiz).compilar() : { components: {}, issues: [] };
    const fuentes = enDisco ? { fontFiles: [...new Set([...(carpetaDeTemas === undefined ? [] : leerFuentes(carpetaDeTemas)), ...leerFuentes(raiz)])] } : {};
    return { sesion: openSession(leerConTemas(leer, raiz, carpetaDeTemas), { ...(opciones.tema !== undefined && { theme: opciones.tema }), ...fuentes, components: codigo.components, adapterIssues: codigo.issues }) };
  } catch (error) {
    return { fallo: uso(`Could not read the Workspace: ${(error as Error).message}`) };
  }
}

export const MAX_ISSUES_POR_DEFECTO = 100;

/** Hasta `MAX_ISSUES_POR_DEFECTO` issues. */
export async function textoDeIssues(sesion: Session): Promise<string> {
  return textoLegible(construirSalida(await sesion.diagnose(), { maxIssues: MAX_ISSUES_POR_DEFECTO, strict: false }));
}

