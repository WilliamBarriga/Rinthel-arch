/**
 * Comando `edit` del CLI (ADR 0005): unica escritura explicita sobre el DSL de texto.
 * `edit --workspace <ruta> [--theme-path <carpeta>] [--json] [--hash <archivo>=<hash>]...`
 * mas una de estas dos formas:
 * - Intencion de Pin: `--view <id> --node <id cualificado> --x N --y N`. El comando calcula la
 *   edicion minima con el AST y el Ubicador (reemplaza el `pin` o lo inserta).
 * - Ediciones ya calculadas: `--edits '<json>'`, un arreglo de `{ file, range, replacement, hash? }`
 *   (p. ej. el `fix` de un issue de `validate`). Rangos 1-based, fin excluido.
 * Concurrencia: cada edicion lleva el hash del archivo que vio quien la pide (`hash` en la edicion
 * o `--hash`); sin hash se usa el del disco al leer. Un hash viejo rechaza todo, sin escritura parcial.
 * Salida: con `--json`, un objeto `salidaDeEditSchema` (su propio `contractVersion`), tambien al
 * rechazar. Codigos: 0 escrito, 1 edicion rechazada o invalida (sin `--json`, mensaje en stderr y
 * stdout vacio), 2 fallo de uso o interno. Solo escribe lo pedido; nunca como efecto de validar.
 */
import { EDIT_CONTRACT_VERSION, edicionesPedidasSchema, salidaDeEditSchema } from 'canonico';
import type { SalidaDeEdit } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { abrirSesion, aplicarEdiciones, edicionDePin, hashDeContenido } from 'sesion';
import type { EdicionConHash } from 'sesion';

import { leerConTemas, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { escribirTexto, leerWorkspace } from './workspace';

const USO =
  "Uso: diagrams edit --workspace <ruta> (--view <id> --node <id> --x N --y N | --edits '<json>') [--hash <archivo>=<hash>] [--theme-path <carpeta>] [--json]";

export async function editar(
  args: readonly string[],
  {
    leer = leerWorkspace,
    escribirArchivo = escribirTexto,
  }: { leer?: (raiz: string) => ArchivosDelWorkspace; escribirArchivo?: (ruta: string, texto: string) => void },
): Promise<ResultadoDeEjecucion> {
  let v;
  try {
    v = parseArgs({
      args: [...args],
      options: {
        workspace: { type: 'string' },
        'theme-path': { type: 'string' },
        json: { type: 'boolean', default: false },
        view: { type: 'string' },
        node: { type: 'string' },
        x: { type: 'string' },
        y: { type: 'string' },
        edits: { type: 'string' },
        hash: { type: 'string', multiple: true },
      },
      strict: true,
    }).values;
  } catch (error) {
    return uso(`${(error as Error).message}. ${USO}`);
  }
  if (v.workspace === undefined) return uso(`Falta --workspace <ruta>. ${USO}`);
  const hayPin = [v.view, v.node, v.x, v.y].some((o) => o !== undefined);
  if (hayPin === (v.edits !== undefined)) {
    return uso(`Indica una intencion de Pin (--view --node --x --y) o --edits, no ambas ni ninguna. ${USO}`);
  }

  const hashes = new Map<string, string>();
  for (const par of v.hash ?? []) {
    const i = par.lastIndexOf('=');
    if (i < 1) return uso(`--hash espera <archivo>=<hash>, recibido '${par}'`);
    hashes.set(par.slice(0, i), par.slice(i + 1));
  }

  let propios: ArchivosDelWorkspace;
  let archivos: ArchivosDelWorkspace;
  try {
    propios = leer(v.workspace);
    archivos = leerConTemas(leer, v.workspace, v['theme-path']);
  } catch (error) {
    return uso(`No se pudo leer el Workspace: ${(error as Error).message}`);
  }
  const hashVigente = (file: string) => hashes.get(file) ?? hashDeContenido(archivos[file] ?? '');
  const json = v.json === true;

  let ediciones: EdicionConHash[];
  if (v.edits !== undefined) {
    let pedidas;
    try {
      pedidas = edicionesPedidasSchema.parse(JSON.parse(v.edits));
    } catch (error) {
      return uso(`--edits no es un arreglo valido de { file, range, replacement, hash? }: ${(error as Error).message}`);
    }
    ediciones = pedidas.map((e) => ({ ...e, hash: e.hash ?? hashVigente(e.file) }));
  } else {
    const x = Number(v.x);
    const y = Number(v.y);
    if (v.view === undefined || v.node === undefined || v.x === undefined || v.y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return uso(`El Pin requiere --view, --node, --x y --y numericos. ${USO}`);
    }
    const sesion = abrirSesion(archivos);
    const indice = sesion.fuente?.views.findIndex(({ id }) => id === v.view) ?? -1;
    const file = indice >= 0 ? sesion.ubicar?.(['views', indice, 'id'])?.file : undefined;
    const calculada = edicionDePin(archivos, {
      vista: v.view,
      nodo: v.node,
      x,
      y,
      hash: file === undefined ? '' : hashVigente(file),
    });
    if (!calculada.ok) return rechazado(calculada, json);
    ediciones = calculada.ediciones;
  }

  const aplicada = aplicarEdiciones(archivos, ediciones);
  if (!aplicada.ok) return rechazado(aplicada, json);
  // Solo se escribe en la raiz del Workspace; los archivos de `--theme-path` no se tocan.
  const cambiados = Object.keys(aplicada.archivos)
    .filter((f) => aplicada.archivos[f] !== archivos[f])
    .sort();
  const fuera = cambiados.find((f) => !(f in propios));
  if (fuera !== undefined) {
    return rechazado({ motivo: 'archivo-desconocido', mensaje: `'${fuera}' no pertenece al Workspace`, file: fuera }, json);
  }
  try {
    for (const f of cambiados) escribirArchivo(join(v.workspace, ...f.split('/')), aplicada.archivos[f] as string);
  } catch (error) {
    return uso(`No se pudo escribir: ${(error as Error).message}`);
  }
  const salida: SalidaDeEdit = salidaDeEditSchema.parse({
    contractVersion: EDIT_CONTRACT_VERSION,
    ok: true,
    edits: ediciones.map(({ file, range, replacement }) => ({ file, range, replacement })),
    files: cambiados,
  });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(salida, null, 2)}\n` : `${cambiados.length} archivo(s) editado(s): ${cambiados.join(', ')}\n`,
    stderr: '',
  };
}

function rechazado(r: { motivo: string; mensaje: string; file?: string }, json: boolean): ResultadoDeEjecucion {
  if (!json) return { exitCode: 1, stdout: '', stderr: `Edicion rechazada (${r.motivo}): ${r.mensaje}\n` };
  const salida = salidaDeEditSchema.parse({
    contractVersion: EDIT_CONTRACT_VERSION,
    ok: false,
    reason: r.motivo,
    message: r.mensaje,
    ...(r.file === undefined ? {} : { file: r.file }),
  });
  return { exitCode: 1, stdout: `${JSON.stringify(salida, null, 2)}\n`, stderr: '' };
}
