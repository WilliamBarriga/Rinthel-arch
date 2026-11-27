/**
 * Comando `inspect`, solo lectura. Con `--json`, un objeto `inspectOutputSchema`.
 * Codigos: 0 respuesta, 1 no existe o el Workspace tiene errores (mensaje en stderr, stdout vacio), 2 fallo de uso o interno.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { INSPECT_COMMANDS } from 'canonical';
import type { InspectCommand } from 'canonical';

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
        kind: { type: 'string' },
        state: { type: 'string' },
        diagram: { type: 'string' },
        catalog: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return fallo(2, (error as Error).message);
  }
  const [comando, argumento, ...sobrantes] = parseado.positionals;
  const uso = 'Usage: diagrams inspect <search|node|view|interaction|planned|theme> [argument] --workspace <path> [--theme-path <folder>] [--json] (theme accepts --kind <kind> --state <state> --diagram <type> --catalog)';
  if (comando === undefined || !(INSPECT_COMMANDS as readonly string[]).includes(comando)) return fallo(2, `Unknown or missing inspect subcommand. ${uso}`);
  if (comando === 'planned' ? argumento !== undefined : argumento === undefined || sobrantes.length > 0) return fallo(2, `inspect ${comando} requires ${comando === 'planned' ? 'no argument' : 'exactly one argument'}. ${uso}`);
  const { kind: tipo, state: estado, diagram: diagrama, catalog: catalogo } = parseado.values;
  if (comando !== 'theme' && (tipo !== undefined || estado !== undefined || diagrama !== undefined || catalogo === true)) return fallo(2, `--kind, --state, --diagram and --catalog only apply to 'inspect theme'. ${uso}`);
  if (parseado.values.workspace === undefined) return fallo(2, 'Missing --workspace <path>');
  const nombrado = OBJETIVO_DE_SUBCOMANDO[comando];
  const resultado = await consultar(leer, parseado.values.workspace, parseado.values['theme-path'], comando, argumento, { tipo, estado, diagrama, catalogo, json: parseado.values.json === true });
  return nombrado === undefined ? resultado : { ...resultado, actividad: { target: { [nombrado]: argumento } } };
}

/** Lo que nombra cada subcomando en el Evento de actividad; `search` e `interaction` no nombran Vista, Nodo ni Tema. */
const OBJETIVO_DE_SUBCOMANDO: Readonly<Record<string, 'view' | 'node' | 'theme'>> = { view: 'view', node: 'node', theme: 'theme' };

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
  if (sesion.source === undefined) {
    return fallo(1, `The Workspace has errors; fix them with 'validate' before querying.\n${(await textoDeIssues(sesion)).trimEnd()}`);
  }
  const respuesta = consultarInspect(sesion, { comando: comando as InspectCommand, argumento: argumento ?? '', catalogo: catalogo === true, ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(diagrama !== undefined && { diagrama }) });
  if (respuesta === undefined) return fallo(1, 'The Workspace has errors; fix them with \'validate\' before querying.');
  if ('notFound' in respuesta) return fallo(1, respuesta.notFound);
  return { exitCode: 0, stdout: json ? comoJson(respuesta.output) : textoLegible(respuesta.output), stderr: '' };
}
