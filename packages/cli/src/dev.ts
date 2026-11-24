/**
 * Comando `dev`: servidor HTTP solo en 127.0.0.1 que sirve la app de `estudio` (`/` y `/_estudio/*`, leidos del disco en
 * cada peticion y con `no-store`), el estado y la Geometria por Vista, y serializa por SSE (`/eventos`) la instantanea de
 * conexion y el flujo de eventos del Workspace vivo (la secuencia es de `sesion`; el protocolo, de `canonico`).
 * Seguridad: 403 a todo `Host` distinto de `127.0.0.1:<puerto>` o `localhost:<puerto>` (DNS rebinding); todo POST exige
 * un `Origin` propio (o ninguno, si no 403) y `application/json` (si no 415); un cuerpo de mas de 64 KiB es 413;
 * `/fuentes/<ruta>` solo sirve archivos de fuente bajo la raiz (si no, 404).
 * `/api/*` y toda ruta no servida aqui: la respuesta completa de `atenderApiDeDev` (ruteo, 400, 404, 405, 409, 422, 500).
 * Puertos: `puertoHttp` es el TCP; `puerto` es el `PuertoDelWorkspaceVivo` (por defecto `puertoDeDisco`: el disco del
 * Workspace y de `--theme-path`, `fs.watch` y el Registro de actividad de `registro-en-disco.ts`).
 * Errores: `iniciarDev` rechaza si el puerto TCP esta ocupado (sin dejar el observador activo) y lanza si la lectura
 * inicial falla; `run(['dev', ...])` los convierte en codigo 2. Un estatico de `estudio` sin construir es 404 al pedirlo.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, rmSync, watch } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { RUTAS_DE_DEV } from 'canonico';
import type { EventoDeDev } from 'canonico';
import { RUTA_DEL_ESTUDIO, activosDelEstudio } from 'estudio';
import type { ActivosDelEstudio } from 'estudio';
import { abrirWorkspaceVivo, atenderApiDeDev } from 'sesion';
import type { PuertoDelWorkspaceVivo, Reloj, WorkspaceVivo } from 'sesion';

import { compiladorDeCodigo } from './codigo';
import type { ResultadoDeCodigo } from './codigo';
import { registroEnDisco } from './registro-en-disco';
import { leerConTemas, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerArchivoDeFuente, leerRecursos, leerWorkspace } from './workspace';

/** `setTimeout` como reloj del Workspace vivo. */
export const relojReal: Reloj = {
  programar(fn, ms) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

/** Todo salvo `workspace` tiene un defecto real. */
export interface OpcionesDeDev {
  workspace: string;
  /** Carpeta de Temas (`--theme-path`): se fusiona antes del Workspace, que gana en rutas repetidas. No se observa. */
  temas?: string;
  /** Puerto TCP en 127.0.0.1 (`--port`); 0 elige uno libre. */
  puertoHttp?: number;
  /** Por donde el Workspace vivo lee, escribe, observa y sigue el Registro de actividad; por defecto `puertoDeDisco(workspace, { temas })`. */
  puerto?: PuertoDelWorkspaceVivo;
  /** Espera en ms tras el ultimo cambio antes de recompilar; por defecto la del Workspace vivo. */
  debounceMs?: number;
  /** Rutas de los estaticos de la app; por defecto las del build de `estudio`. Se consultan en cada peticion. */
  estudio?: () => ActivosDelEstudio;
  /** `--trust-code`: sirve `/componentes.js` sin pedir confirmacion en el navegador. Por defecto `false`. */
  confiarEnCodigo?: boolean;
  /** Compila los `.tsx` de `workspace`; por defecto el adaptador de esbuild (un Workspace inexistente no tiene codigo). */
  compilarCodigo?: () => ResultadoDeCodigo;
}

export interface ServidorDev {
  /** `http://127.0.0.1:<puerto>/` */
  url: string;
  /** Componentes de Tema que los Temas del Workspace usaban al arrancar (vacio si no hay codigo). */
  conCodigo: string[];
  /** Si el codigo ya se sirve (confirmado de antemano con `confiarEnCodigo`). */
  confiado: boolean;
  cerrar(): Promise<void>;
}

/** `fs.watch` recursivo; ignora carpetas ocultas (`.diagrams/`, `.git/`) y `node_modules`. */
function observarDisco(raiz: string, alCambiar: () => void): () => void {
  const observador = watch(raiz, { recursive: true }, (_evento, nombre) => {
    if (nombre !== null && nombre.split(/[\\/]/).some((parte) => parte.startsWith('.') || parte === 'node_modules')) return;
    alCambiar();
  });
  return () => observador.close();
}

/** Avisa de cualquier cambio bajo `raiz`; devuelve como dejar de observar. */
export type Observador = (raiz: string, alCambiar: () => void) => () => void;

/**
 * El Workspace vivo sobre el disco: los `.dg` de `workspace` (propios) fusionados tras los de `temas`, escritura atomica
 * bajo la raiz, recursos (`.tsx`, fuentes) de ambas carpetas, el observador (`fs.watch` recursivo por defecto) y el
 * Registro de actividad de `registro-en-disco.ts`.
 */
export function puertoDeDisco(workspace: string, { temas, observar = observarDisco }: { temas?: string; observar?: Observador } = {}): PuertoDelWorkspaceVivo {
  return {
    actividad: registroEnDisco(workspace),
    leer: () => ({ propios: leerWorkspace(workspace), disco: leerConTemas(leerWorkspace, workspace, temas) }),
    escribir: (ruta, texto) => escribirTexto(destinoEnWorkspace(workspace, ruta), texto),
    borrar: (ruta) => rmSync(destinoEnWorkspace(workspace, ruta), { force: true }),
    recursos: () => ({ ...(temas === undefined ? {} : leerRecursos(temas)), ...leerRecursos(workspace) }),
    observar: (alCambiar) => observar(workspace, alCambiar),
  };
}

const LIMITE_DEL_CUERPO = 64 * 1024;

/** `undefined` si pasa de `LIMITE_DEL_CUERPO`; rechaza si la conexion falla. */
function leerCuerpo(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((ok, fallo) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', (trozo: string) => {
      texto += trozo;
      if (texto.length > LIMITE_DEL_CUERPO) {
        req.removeAllListeners('data');
        req.resume();
        ok(undefined);
      }
    });
    req.on('end', () => ok(texto));
    req.on('error', fallo);
  });
}

function cabecera(res: ServerResponse, tipo: string, estado = 200): void {
  res.writeHead(estado, { 'content-type': `${tipo}; charset=utf-8`, 'cache-control': 'no-store' });
}

const responder = (res: ServerResponse, estadoHttp: number, cuerpo: unknown): void => {
  cabecera(res, 'application/json', estadoHttp);
  res.end(JSON.stringify(cuerpo));
};

const TIPOS_DE_ESTATICO: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Lee del disco en cada peticion (un rebuild de `estudio` se ve al recargar); ausente -> 404. */
function servirEstatico(res: ServerResponse, ruta: string | undefined): void {
  let bytes: Buffer;
  try {
    if (ruta === undefined) throw new Error('not declared');
    bytes = readFileSync(ruta);
  } catch {
    cabecera(res, 'text/plain', 404);
    res.end('Not found (if the app build is missing: pnpm --filter estudio build)');
    return;
  }
  cabecera(res, TIPOS_DE_ESTATICO[extname(ruta)] ?? 'application/octet-stream');
  res.end(bytes);
}

/** El codigo de Temas se sirve en `/componentes.js` solo tras `POST /api/confiar` o `confiarEnCodigo`. */
export async function iniciarDev(opciones: OpcionesDeDev): Promise<ServidorDev> {
  const { workspace, temas, puertoHttp = 0, debounceMs, estudio = activosDelEstudio, confiarEnCodigo = false } = opciones;
  const { puerto = puertoDeDisco(workspace, temas === undefined ? {} : { temas }), compilarCodigo = compiladorDeCodigo(workspace).compilar } = opciones;
  const vivo: WorkspaceVivo = await abrirWorkspaceVivo({
    puerto,
    raiz: resolve(workspace),
    reloj: relojReal,
    ahora: Date.now,
    confiarEnCodigo,
    ...(debounceMs !== undefined && { debounceMs }),
    compilarCodigo,
  });

  const clientes = new Set<ServerResponse>();
  /** La secuencia de eventos es del Workspace vivo; aqui solo se serializa como SSE. */
  const enviar = (cliente: ServerResponse, { nombre, datos }: EventoDeDev): void => void cliente.write(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);
  const dejarDeEscuchar = vivo.escuchar((evento) => {
    for (const cliente of clientes) enviar(cliente, evento);
  });

  const hostsPropios = (): string[] => {
    const { port } = servidor.address() as AddressInfo;
    return [`127.0.0.1:${port}`, `localhost:${port}`];
  };

  /** Controles del transporte de un POST: `Origin` propio (o ninguno) y JSON; si fallan, el estado y el mensaje. */
  const rechazoDelPost = (req: IncomingMessage): [number, string] | undefined => {
    const origen = req.headers.origin;
    if (origen !== undefined && !hostsPropios().some((host) => origen === `http://${host}`)) return [403, 'Origin not allowed'];
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return [415, 'Se esperaba application/json'];
    return undefined;
  };

  /** La API responde completo; aqui solo se controla y se lee el transporte. */
  const api = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const metodo = req.method ?? 'GET';
    let cuerpo: string | undefined;
    if (metodo === 'POST') {
      const rechazo = rechazoDelPost(req);
      if (rechazo !== undefined) return responder(res, rechazo[0], { ok: false, mensaje: rechazo[1] });
      cuerpo = await leerCuerpo(req);
      if (cuerpo === undefined) return responder(res, 413, { ok: false, mensaje: 'Cuerpo demasiado grande' });
    }
    const respuesta = await atenderApiDeDev(vivo, { metodo, url, ...(cuerpo !== undefined && { cuerpo }) });
    res.writeHead(respuesta.status, respuesta.cabeceras);
    res.end(respuesta.cuerpo);
  };

  /** Una ruta mal codificada o que sale de la raiz da `undefined`. */
  const servirFuente = (rutaCodificada: string): ReturnType<typeof leerArchivoDeFuente> => {
    try {
      return leerArchivoDeFuente(temas === undefined ? [workspace] : [workspace, temas], decodeURIComponent(rutaCodificada));
    } catch {
      return undefined;
    }
  };

  const servidor = createServer((req, res) => {
    // Contra DNS rebinding.
    if (!hostsPropios().includes(req.headers.host ?? '')) {
      cabecera(res, 'text/plain', 403);
      res.end('Host not allowed');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const ruta = url.pathname;
    if (ruta === '/') {
      servirEstatico(res, estudio().indice);
    } else if (ruta.startsWith(RUTA_DEL_ESTUDIO)) {
      const { archivos } = estudio();
      const nombre = ruta.slice(RUTA_DEL_ESTUDIO.length);
      servirEstatico(res, Object.hasOwn(archivos, nombre) ? archivos[nombre] : undefined);
    } else if (ruta.startsWith(RUTAS_DE_DEV.fuentes)) {
      const fuente = servirFuente(ruta.slice(RUTAS_DE_DEV.fuentes.length));
      if (fuente === undefined) {
        cabecera(res, 'text/plain', 404);
        res.end('No encontrado');
      } else {
        res.writeHead(200, { 'content-type': fuente.tipo, 'cache-control': 'no-store', 'content-length': fuente.bytes.length });
        res.end(fuente.bytes);
      }
    } else if (ruta === RUTAS_DE_DEV.eventos) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clientes.add(res);
      res.on('close', () => clientes.delete(res));
      for (const evento of vivo.conexion()) enviar(res, evento);
    } else {
      // Una conexion que se corta al leer el cuerpo no tiene a quien responder.
      api(req, res, url).catch(() => res.destroy());
    }
  });

  const detener = (): void => {
    dejarDeEscuchar();
    vivo.cerrar();
  };
  await new Promise<void>((ok, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(puertoHttp, '127.0.0.1', () => ok());
  }).catch((error: unknown) => {
    detener();
    throw error;
  });
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('The server has no port');
  const { componentes, confiado } = vivo.codigo();

  return {
    url: `http://127.0.0.1:${direccion.port}/`,
    conCodigo: componentes,
    confiado,
    cerrar: () =>
      new Promise<void>((ok) => {
        detener();
        servidor.close(() => ok());
        servidor.closeAllConnections();
      }),
  };
}


/** Vuelve con la URL; el servidor mantiene vivo el proceso. Puerto TCP 4173 por defecto. `observar` reemplaza a `fs.watch`. */
export async function comandoDev(
  args: readonly string[],
  dependencias: Pick<OpcionesDeDev, 'estudio'> & { observar?: Observador } = {},
): Promise<ResultadoDeEjecucion> {
  const uso = usoComun;
  let valores;
  try {
    valores = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, port: { type: 'string' }, 'theme-path': { type: 'string' }, 'trust-code': { type: 'boolean' } }, strict: true }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (valores.workspace === undefined) return uso('Falta --workspace <ruta>');
  const puertoHttp = Number(valores.port ?? 4173);
  if (!Number.isInteger(puertoHttp) || puertoHttp < 0 || puertoHttp > 65535) return uso('--port must be an integer between 0 and 65535');
  const { observar, estudio } = dependencias;
  const workspace = valores.workspace;
  const temas = valores['theme-path'];
  try {
    const servidor = await iniciarDev({
      workspace,
      puertoHttp,
      ...(estudio !== undefined && { estudio }),
      ...(temas !== undefined && { temas }),
      ...(observar !== undefined && { puerto: puertoDeDisco(workspace, { ...(temas !== undefined && { temas }), observar }) }),
      ...(valores['trust-code'] === true && { confiarEnCodigo: true }),
    });
    const aviso =
      servidor.conCodigo.length === 0
        ? ''
        : servidor.confiado
          ? `WARNING: the Workspace Themes load code (${servidor.conCodigo.join(', ')}); confirmed with --trust-code.\n`
          : `WARNING: the Workspace Themes load code (${servidor.conCodigo.join(', ')}) that runs in your browser without a sandbox. The viewer will ask for confirmation before loading it; use --trust-code only on a Workspace you own.\n`;
    return { exitCode: 0, stdout: `${aviso}diagrams dev listening on ${servidor.url}\n`, stderr: '' };
  } catch (error) {
    return uso(`Could not start dev: ${(error as Error).message}`);
  }
}
