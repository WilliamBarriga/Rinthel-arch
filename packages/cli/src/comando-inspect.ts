/**
 * Comando `inspect` del CLI (ADR 0005): `inspect <buscar|nodo|vista|tema> <argumento> --workspace <ruta> [--theme-path <carpeta>] [--json]`.
 * `inspect tema <nombre> [--tipo T] [--estado E] [--catalogo]` resuelve la cascada de un Tema (enmienda de Temas).
 * Solo lectura. Salida: texto legible o, con `--json`, un objeto `salidaDeInspectSchema`
 * (su propio `contractVersion`). Codigos: 0 respuesta, 1 el Nodo/Vista no existe o el
 * Workspace tiene errores (mensaje en stderr, stdout vacio), 2 fallo de uso o interno.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';

import { comoJson, consultar, consultarTema, textoLegible } from './inspect';
import { abrirSesionDe, textoDeIssues, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { leerWorkspace } from './workspace';

const SUBCOMANDOS = ['buscar', 'nodo', 'vista', 'tema'] as const;
const fallo = (exitCode: 1 | 2, mensaje: string): ResultadoDeEjecucion => ({ ...usoComun(mensaje), exitCode });

export async function inspeccionar(
  args: readonly string[],
  { leer = leerWorkspace }: { leer?: (raiz: string) => ArchivosDelWorkspace },
): Promise<ResultadoDeEjecucion> {
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
        catalogo: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return fallo(2, (error as Error).message);
  }
  const [comando, argumento, ...sobrantes] = parseado.positionals;
  const uso = 'Uso: diagrams inspect <buscar|nodo|vista|tema> <argumento> --workspace <ruta> [--theme-path <carpeta>] [--json] (tema admite --tipo <tipo> --estado <estado> --catalogo)';
  if (comando === undefined || !(SUBCOMANDOS as readonly string[]).includes(comando)) return fallo(2, `Subcomando de inspect desconocido o ausente. ${uso}`);
  if (argumento === undefined || sobrantes.length > 0) return fallo(2, `inspect ${comando} requiere exactamente un argumento. ${uso}`);
  const { tipo, estado, catalogo } = parseado.values;
  if (comando !== 'tema' && (tipo !== undefined || estado !== undefined || catalogo === true)) return fallo(2, `--tipo, --estado y --catalogo solo valen con 'inspect tema'. ${uso}`);
  if (parseado.values.workspace === undefined) return fallo(2, 'Falta --workspace <ruta>');

  const abierta = abrirSesionDe(leer, parseado.values.workspace, parseado.values['theme-path']);
  if ('fallo' in abierta) return abierta.fallo;
  const { sesion } = abierta;
  if (sesion.fuente === undefined || sesion.ubicar === undefined) {
    return fallo(1, `El Workspace tiene errores; corrigelos con 'validate' antes de consultar.\n${(await textoDeIssues(sesion)).trimEnd()}`);
  }
  const respuesta =
    comando === 'tema'
      ? consultarTema(sesion.fuente, sesion.origenesDeTema, { nombre: argumento, catalogo: catalogo === true, ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }) })
      : consultar(sesion.fuente, sesion.ubicar, { comando: comando as 'buscar' | 'nodo' | 'vista', argumento });
  if ('noEncontrado' in respuesta) return fallo(1, respuesta.noEncontrado);
  return { exitCode: 0, stdout: parseado.values.json ? comoJson(respuesta.salida) : textoLegible(respuesta.salida), stderr: '' };
}
