/**
 * Command `export`: writes the Dev UI of a Workspace as one self-contained, read-only HTML file (`--out`). The data
 * is captured through the `dev` API of a live Workspace that is opened, read once and closed (no server, no watcher,
 * nothing written next to the Workspace); the page, the layout Worker and the CSS come from the `estudio` build.
 * Fonts of the Themes (Workspace and `--theme-path`) go inside as `data:` URLs; Theme components with code go inside
 * too (whoever exports is the author, as with `dev --trust-code`), and the command says so.
 * Exit codes: 0 written, 1 the Workspace does not compile (its Issues on stdout, nothing written), 2 usage or I/O.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { capturarExportado, carpetaDelEstudio, htmlDeExportado } from 'estudio';
import { abrirWorkspaceVivo, atenderApiDeDev } from 'sesion';

import { puertoDeDisco, relojReal } from './dev';
import { abrirSesionDe, textoDeIssues, uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { leerArchivoDeFuente, leerWorkspace } from './workspace';

export interface DependenciasDeExport {
  /** Folder of the `estudio` build; by default the real one. */
  estaticos?: string;
}

const MB = 1024 * 1024;

export async function comandoExport(args: readonly string[], { estaticos = carpetaDelEstudio() }: DependenciasDeExport = {}): Promise<ResultadoDeEjecucion> {
  let valores;
  try {
    valores = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, out: { type: 'string' }, 'theme-path': { type: 'string' } }, strict: true }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (valores.workspace === undefined) return uso('Missing --workspace <path>');
  if (valores.out === undefined) return uso('Missing --out <file>.html');
  const workspace = valores.workspace;
  const temas = valores['theme-path'];

  const abierta = abrirSesionDe(leerWorkspace, workspace, temas);
  if ('fallo' in abierta) return abierta.fallo;
  if (abierta.sesion.fuente === undefined) return { exitCode: 1, stdout: await textoDeIssues(abierta.sesion), stderr: '' };

  let html: string;
  let vistas: number;
  let componentes: string[];
  try {
    const vivo = await abrirWorkspaceVivo({
      puerto: { ...puertoDeDisco(workspace, temas === undefined ? {} : { temas }), observar: () => () => undefined },
      raiz: resolve(workspace),
      reloj: relojReal,
      ahora: Date.now,
      confiarEnCodigo: true,
    });
    try {
      const fetchDeDev = (async (entrada: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(entrada), 'http://127.0.0.1');
        const r = await atenderApiDeDev(vivo, { metodo: init?.method ?? 'GET', url, ...(typeof init?.body === 'string' && { cuerpo: init.body }) });
        return new Response(r.cuerpo, { status: r.status, headers: r.cabeceras });
      }) as typeof fetch;
      const raices = temas === undefined ? [workspace] : [workspace, temas];
      const datos = await capturarExportado({ fetch: fetchDeDev, leerFuente: (ruta) => leerArchivoDeFuente(raices, ruta) });
      vistas = datos.estado.vistas.length;
      componentes = datos.componentes?.nombres ?? [];
      html = htmlDeExportado(datos, { titulo: `${basename(resolve(workspace))} - rinthel-arch`, estaticos });
    } finally {
      vivo.cerrar();
    }
  } catch (error) {
    return uso(`Could not export: ${(error as Error).message}`);
  }

  const out = valores.out;
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
  } catch (error) {
    return uso(`Could not write '${out}': ${(error as Error).message}`);
  }
  const aviso = componentes.length === 0 ? '' : `NOTE: the file includes the code of the Theme components (${componentes.join(', ')}); it runs in the browser of whoever opens it.\n`;
  return { exitCode: 0, stdout: `${aviso}Exported ${vistas} Views to ${out} (${(Buffer.byteLength(html) / MB).toFixed(2)} MB)\n`, stderr: '' };
}
