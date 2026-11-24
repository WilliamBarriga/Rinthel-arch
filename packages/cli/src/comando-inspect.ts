/**
 * Comando `inspect`, solo lectura. Con `--json`, un objeto `salidaDeInspectSchema`.
 * Codigos: 0 respuesta, 1 no existe o el Workspace tiene errores (mensaje en stderr, stdout vacio), 2 fallo de uso o interno.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { COMANDOS_DE_INSPECT } from 'canonico';
import type { ComandoDeInspect } from 'canonico';

import { comoJson, consultarInspect, textoLegible } from './inspect';
import { abrirSesionDe, textoDeIssues, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import type { ResultadoConActividad } from './actividad';
import { leerWorkspace } from './workspace';

const fallo = (exitCode: 1 | 2, mensaje: string): ResultadoDeEjecucion => ({ ...usoComun(mensaje), exitCode });

export async function inspeccionar(
  args: readonly string[],
  { leer = leerWorkspace }: { leer?: (raiz: string) => ArchivosDelWorkspace },
): Promise<ResultadoConActividad> {
  let parseado;
  try {
    parseado = parseArgs({
      args: [...args],
      options: {
        workspace: { type: 'string' },
        'theme-path': { type: 'string' },
        json: { type: 'boolean', default: false },
        tipo: { type: 'string' },
        estado: { type: 'string' },
        diagrama: { type: 'string' },
        catalogo: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return fallo(2, (error as Error).message);
  }
  const [comando, argumento, ...sobrantes] = parseado.positionals;
  const uso = 'Uso: diagrams inspect <buscar|nodo|vista|interaccion|tema> <argumento> --workspace <ruta> [--theme-path <carpeta>] [--json] (tema admite --tipo <tipo> --estado <estado> --diagrama <tipo> --catalogo)';
  if (comando === undefined || !(COMANDOS_DE_INSPECT as readonly string[]).includes(comando)) return fallo(2, `Unknown or missing inspect subcommand. ${uso}`);
  if (argumento === undefined || sobrantes.length > 0) return fallo(2, `inspect ${comando} requires exactly one argument. ${uso}`);
  const { tipo, estado, diagrama, catalogo } = parseado.values;
  if (comando !== 'tema' && (tipo !== undefined || estado !== undefined || diagrama !== undefined || catalogo === true)) return fallo(2, `--tipo, --estado, --diagrama y --catalogo only apply to 'inspect tema'. ${uso}`);
  if (parseado.values.workspace === undefined) return fallo(2, 'Falta --workspace <ruta>');
  const nombrado = OBJETIVO_DE_SUBCOMANDO[comando];
  const resultado = await consultar(leer, parseado.values.workspace, parseado.values['theme-path'], comando, argumento, { tipo, estado, diagrama, catalogo, json: parseado.values.json === true });
  return nombrado === undefined ? resultado : { ...resultado, actividad: { objetivo: { [nombrado]: argumento } } };
}

/** Lo que nombra cada subcomando en el Evento de actividad; `buscar` e `interaccion` no nombran Vista, Nodo ni Tema. */
const OBJETIVO_DE_SUBCOMANDO: Readonly<Record<string, 'vista' | 'nodo' | 'tema'>> = { vista: 'vista', nodo: 'nodo', tema: 'tema' };

async function consultar(
  leer: (raiz: string) => ArchivosDelWorkspace,
  workspace: string,
  carpetaDeTemas: string | undefined,
  comando: string,
  argumento: string,
  { tipo, estado, diagrama, catalogo, json }: { tipo?: string | undefined; estado?: string | undefined; diagrama?: string | undefined; catalogo?: boolean | undefined; json: boolean },
): Promise<ResultadoDeEjecucion> {

  const abierta = abrirSesionDe(leer, workspace, carpetaDeTemas);
  if ('fallo' in abierta) return abierta.fallo;
  const { sesion } = abierta;
  if (sesion.fuente === undefined) {
    return fallo(1, `The Workspace has errors; fix them with 'validate' before querying.\n${(await textoDeIssues(sesion)).trimEnd()}`);
  }
  const respuesta = consultarInspect(sesion, { comando: comando as ComandoDeInspect, argumento, catalogo: catalogo === true, ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(diagrama !== undefined && { diagrama }) });
  if (respuesta === undefined) return fallo(1, 'The Workspace has errors; fix them with \'validate\' before querying.');
  if ('noEncontrado' in respuesta) return fallo(1, respuesta.noEncontrado);
  return { exitCode: 0, stdout: json ? comoJson(respuesta.salida) : textoLegible(respuesta.salida), stderr: '' };
}
