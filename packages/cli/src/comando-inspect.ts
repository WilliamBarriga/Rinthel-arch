/**
 * Comando `inspect` del CLI (ADR 0009): `inspect <buscar|nodo|vista> <argumento> --workspace <ruta> [--json]`.
 * Solo lectura. Salida: texto legible o, con `--json`, un objeto `salidaDeInspectSchema`
 * (su propio `contractVersion`). Codigos: 0 respuesta, 1 el Nodo/Vista no existe o el
 * Workspace tiene errores (mensaje en stderr, stdout vacio), 2 fallo de uso o interno.
 */
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';
import { abrirSesion } from 'sesion';

import { comoJson, consultar, textoLegible } from './inspect';
import { construirSalida, textoLegible as textoDeIssues } from './validate';
import { leerWorkspace } from './workspace';

interface Resultado {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

const SUBCOMANDOS = ['buscar', 'nodo', 'vista'] as const;
const fallo = (exitCode: 1 | 2, mensaje: string): Resultado => ({ exitCode, stdout: '', stderr: `${mensaje}\n` });

export async function inspeccionar(
  args: readonly string[],
  { leer = leerWorkspace }: { leer?: (raiz: string) => ArchivosDelWorkspace },
): Promise<Resultado> {
  let parseado;
  try {
    parseado = parseArgs({
      args: [...args],
      options: { workspace: { type: 'string' }, json: { type: 'boolean', default: false } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return fallo(2, (error as Error).message);
  }
  const [comando, argumento, ...sobrantes] = parseado.positionals;
  const uso = 'Uso: diagrams inspect <buscar|nodo|vista> <argumento> --workspace <ruta> [--json]';
  if (comando === undefined || !(SUBCOMANDOS as readonly string[]).includes(comando)) return fallo(2, `Subcomando de inspect desconocido o ausente. ${uso}`);
  if (argumento === undefined || sobrantes.length > 0) return fallo(2, `inspect ${comando} requiere exactamente un argumento. ${uso}`);
  if (parseado.values.workspace === undefined) return fallo(2, 'Falta --workspace <ruta>');

  let sesion;
  try {
    sesion = abrirSesion(leer(parseado.values.workspace));
  } catch (error) {
    return fallo(2, `No se pudo leer el Workspace: ${(error as Error).message}`);
  }
  if (sesion.fuente === undefined || sesion.ubicar === undefined) {
    const issues = construirSalida(await sesion.diagnosticar(), { maxIssues: 100, strict: false });
    return fallo(1, `El Workspace tiene errores; corrigelos con 'validate' antes de consultar.\n${textoDeIssues(issues).trimEnd()}`);
  }
  const respuesta = consultar(sesion.fuente, sesion.ubicar, { comando: comando as (typeof SUBCOMANDOS)[number], argumento });
  if ('noEncontrado' in respuesta) return fallo(1, respuesta.noEncontrado);
  return { exitCode: 0, stdout: parseado.values.json ? comoJson(respuesta.salida) : textoLegible(respuesta.salida), stderr: '' };
}
