/**
 * Comando `edit` del CLI (ADR 0005): unica escritura explicita sobre el DSL de texto.
 * `edit --workspace <ruta> [--theme-path <carpeta>] [--json] [--hash <archivo>=<hash>]...`
 * mas una de estas tres formas:
 * - Intencion de Pin: `--view <id> --node <id cualificado> --x N --y N`, la Intencion `mover-pin`: el Gesto
 *   calcula la edicion minima (reemplaza el `pin` o lo inserta), la auto-prueba y la aplica en memoria.
 * - Intencion por su contrato JSON: `--intent '<json>'`, p. ej. `{"tipo":"ordenar-lifelines","vista":"flujo","orden":["a","b"]}`
 *   (ADR 0007/0009); la Intencion no lleva `hash` (uno heredado en el JSON se ignora).
 * - Ediciones ya calculadas: `--edits '<json>'`, un arreglo de `{ file, range, replacement, hash? }`
 *   (p. ej. el `fix` de un issue de `validate`). Rangos 1-based, fin excluido.
 * Los tres modos escriben solo por la puerta `aplicarAlWorkspace` de `sesion`.
 * Concurrencia: `--hash <archivo>=<hash>` es el `visto` de la Intencion; cada edicion estructurada lleva su
 * `hash` (o toma `--hash`; sin ninguno, el del disco al leer). Un hash viejo rechaza todo, sin escritura parcial.
 * Salida: con `--json`, un objeto `salidaDeEditSchema` (su propio `contractVersion`), tambien al
 * rechazar. Codigos: 0 escrito, 1 edicion rechazada o invalida (sin `--json`, mensaje en stderr y
 * stdout vacio; el codigo de cada motivo sale de la tabla unica `SALIDA_DE_RECHAZO` de `rechazos.ts`),
 * 2 fallo de uso o interno. Solo escribe lo pedido; nunca como efecto de validar.
 */
import { EDIT_CONTRACT_VERSION, edicionesPedidasSchema, intencionSchema, salidaDeEditSchema } from 'canonico';
import type { SalidaDeEdit } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { parseArgs } from 'node:util';
import { aplicarAlWorkspace, hashDeContenido } from 'sesion';
import type { Aplicable } from 'sesion';

import { leerConTemas, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { SALIDA_DE_RECHAZO } from './rechazos';
import type { RechazoDeEdicion } from './rechazos';
import { destinoEnWorkspace, escribirTexto, leerWorkspace } from './workspace';

const USO =
  "Uso: diagrams edit --workspace <ruta> (--view <id> --node <id> --x N --y N | --intent '<json>' | --edits '<json>') [--hash <archivo>=<hash>] [--theme-path <carpeta>] [--json]";

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
        intent: { type: 'string' },
        hash: { type: 'string', multiple: true },
      },
      strict: true,
    }).values;
  } catch (error) {
    return uso(`${(error as Error).message}. ${USO}`);
  }
  if (v.workspace === undefined) return uso(`Falta --workspace <ruta>. ${USO}`);
  const hayPin = [v.view, v.node, v.x, v.y].some((o) => o !== undefined);
  if ([hayPin, v.edits !== undefined, v.intent !== undefined].filter(Boolean).length !== 1) {
    return uso(`Indica una intencion de Pin (--view --node --x --y), --intent o --edits, solo una. ${USO}`);
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

  let aplicable: Aplicable;
  if (v.edits !== undefined) {
    let pedidas;
    try {
      pedidas = edicionesPedidasSchema.parse(JSON.parse(v.edits));
    } catch (error) {
      return uso(`--edits no es un arreglo valido de { file, range, replacement, hash? }: ${(error as Error).message}`);
    }
    aplicable = pedidas.map((e) => ({ ...e, hash: e.hash ?? hashVigente(e.file) }));
  } else if (v.intent !== undefined) {
    let crudo;
    try {
      crudo = JSON.parse(v.intent) as Record<string, unknown>;
    } catch (error) {
      return uso(`--intent no es JSON: ${(error as Error).message}`);
    }
    // Un `hash` heredado en el JSON se ignora: la concurrencia de una Intencion la decide `--hash` (visto).
    const leida = intencionSchema.safeParse(crudo);
    if (!leida.success) return uso(`--intent no es una Intencion valida: ${leida.error.message}`);
    aplicable = leida.data;
  } else {
    const x = Number(v.x);
    const y = Number(v.y);
    if (v.view === undefined || v.node === undefined || v.x === undefined || v.y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return uso(`El Pin requiere --view, --node, --x y --y numericos. ${USO}`);
    }
    aplicable = { tipo: 'mover-pin', vista: v.view, nodo: v.node, x, y };
  }

  // Puerta de escritura unica de `sesion`: todo o nada, solo en la raiz del Workspace (no en `--theme-path`).
  const raiz = v.workspace;
  let resultado;
  try {
    resultado = aplicarAlWorkspace(
      { leer: () => ({ disco: archivos, propios }), escribir: (f, texto) => escribirArchivo(destinoEnWorkspace(raiz, f), texto) },
      aplicable,
      Object.fromEntries(hashes),
    );
  } catch (error) {
    return uso(`No se pudo escribir: ${(error as Error).message}`);
  }
  if (!resultado.ok) return rechazado(resultado, json);
  const { ediciones, cambiados } = resultado;
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

function rechazado(r: RechazoDeEdicion, json: boolean): ResultadoDeEjecucion {
  const { exitCode } = SALIDA_DE_RECHAZO[r.motivo];
  if (!json) return { exitCode, stdout: '', stderr: `Edicion rechazada (${r.motivo}): ${r.mensaje}\n` };
  const salida = salidaDeEditSchema.parse({
    contractVersion: EDIT_CONTRACT_VERSION,
    ok: false,
    reason: r.motivo,
    message: r.mensaje,
    ...(r.file === undefined ? {} : { file: r.file }),
  });
  return { exitCode, stdout: `${JSON.stringify(salida, null, 2)}\n`, stderr: '' };
}
