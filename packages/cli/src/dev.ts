/**
 * Comando `dev`: servidor HTTP solo en 127.0.0.1 que sirve el shell, el estado y la Geometria por Vista, y empuja el estado por SSE (`/eventos`).
 * Seguridad: 403 a todo `Host` distinto de `127.0.0.1:<puerto>` o `localhost:<puerto>` (DNS rebinding); las rutas POST exigen
 * JSON y un `Origin` propio (o ninguno); `/fuentes/<ruta>` solo sirve archivos de fuente bajo la raiz (si no, 404).
 * Edicion: 400 cuerpo invalido, 409 `hash-desactualizado`, 422 el resto de rechazos, 500 fallo de I/O.
 * Errores: `iniciarDev` rechaza si el puerto esta ocupado o el shell no se empaqueta (sin dejar el observador activo)
 * y lanza si la lectura inicial falla; `run(['dev', ...])` los convierte en codigo 2.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rmSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { RUTA_DE_FUENTES, intencionSchema } from 'canonico';
import type { EstadoDeDev, Intencion } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { compiladorDeCodigo } from './codigo';
import type { ResultadoDeCodigo } from './codigo';
import { empaquetarShellDev } from './dev-shell';
import { SALIDA_DE_RECHAZO, rechazoDeEdicion } from './rechazos';
import { leerConTemas, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerArchivoDeFuente, leerRecursos as leerRecursosReal, leerWorkspace } from './workspace';
import { abrirWorkspaceVivo } from './workspace-vivo';
import type { PuertoDelWorkspaceVivo, ResultadoDelWorkspaceVivo, WorkspaceVivo } from './workspace-vivo';

export interface ShellDev {
  pagina: string;
  worker: string;
}

/** Todo salvo `workspace` tiene un defecto real. */
export interface OpcionesDeDev {
  workspace: string;
  /** Carpeta de Temas (`--theme-path`): se fusiona antes del Workspace, que gana en rutas repetidas. No se observa. */
  temas?: string;
  /** Puerto en 127.0.0.1; 0 elige uno libre. */
  puerto?: number;
  /** Espera en ms tras el ultimo cambio antes de recompilar; por defecto `DEBOUNCE_MS`. */
  debounceMs?: number;
  leer?: (raiz: string) => ArchivosDelWorkspace;
  /** Hash de cada recurso vigilado (`.tsx`, fuentes) bajo `raiz`; por defecto lee el disco (o nada si se inyecta `leer`). */
  leerRecursos?: (raiz: string) => Record<string, string>;
  /** Avisa de cualquier cambio bajo `raiz`; devuelve como dejar de observar. */
  observar?: (raiz: string, alCambiar: () => void) => () => void;
  shell?: () => Promise<ShellDev>;
  /** `ruta` relativa a `raiz`. */
  escribir?: (raiz: string, ruta: string, texto: string) => void;
  /** `ruta` relativa a `raiz`. */
  borrar?: (raiz: string, ruta: string) => void;
  /** `--trust-code`: sirve `/componentes.js` sin pedir confirmacion en el navegador. Por defecto `false`. */
  confiarEnCodigo?: boolean;
  /** Compila los `.tsx` del Workspace; por defecto el adaptador de esbuild (o nada si se inyecta `leer`). */
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

/** Atomica y siempre bajo la raiz del Workspace. */
function escribirEnDisco(raiz: string, ruta: string, texto: string): void {
  escribirTexto(destinoEnWorkspace(raiz, ruta), texto);
}

/** Siempre bajo la raiz del Workspace; un archivo ya ausente no es error. */
function borrarEnDisco(raiz: string, ruta: string): void {
  rmSync(destinoEnWorkspace(raiz, ruta), { force: true });
}

/** Con `leer` inyectado y sin `leerRecursos`, `recursos()` da `undefined`. */
function puertoDeDisco(opciones: OpcionesDeDev): PuertoDelWorkspaceVivo {
  const { workspace, temas, leer = leerWorkspace, escribir = escribirEnDisco, borrar = borrarEnDisco, observar = observarDisco } = opciones;
  const conoceRecursos = opciones.leer === undefined || opciones.leerRecursos !== undefined;
  const leerRecursos = opciones.leerRecursos ?? leerRecursosReal;
  return {
    leer: () => ({ propios: leer(workspace), disco: leerConTemas(leer, workspace, temas) }),
    escribir: (ruta, texto) => escribir(workspace, ruta, texto),
    borrar: (ruta) => borrar(workspace, ruta),
    recursos: () => (conoceRecursos ? { ...(temas === undefined ? {} : leerRecursos(temas)), ...leerRecursos(workspace) } : undefined),
    observar: (alCambiar) => observar(workspace, alCambiar),
  };
}

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fallo) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', (trozo: string) => {
      texto += trozo;
      if (texto.length > 64 * 1024) fallo(new Error('Cuerpo demasiado grande'));
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

const responderResultado = (res: ServerResponse, r: ResultadoDelWorkspaceVivo): void =>
  r.ok ? responder(res, 200, r) : responder(res, SALIDA_DE_RECHAZO[r.motivo].estadoHttp, rechazoDeEdicion(r.motivo, r.mensaje, r.file));

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>diagrams dev</title>
<style>html,body,#raiz{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif}</style>
</head>
<body>
<div id="raiz"></div>
<script src="/app.js"></script>
</body>
</html>
`;

const comoIntencion = (cuerpo: unknown): Intencion | undefined => {
  const r = intencionSchema.safeParse(cuerpo);
  return r.success ? r.data : undefined;
};

/** `version` del estado que vio la pagina, si es un entero no negativo; una version olvidada rechaza con `hash-desactualizado`. */
const versionVista = (cuerpo: unknown): number | undefined => {
  const version = (cuerpo as { version?: unknown } | null)?.version;
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : undefined;
};

/** El codigo de Temas se sirve en `/componentes.js` solo tras `POST /api/confiar` o `confiarEnCodigo`. */
export async function iniciarDev(opciones: OpcionesDeDev): Promise<ServidorDev> {
  const { workspace, temas, puerto = 0, debounceMs, shell = empaquetarShellDev, confiarEnCodigo = false } = opciones;
  // Con `leer` inyectado no hay disco del que compilar codigo.
  const compilarCodigo = opciones.compilarCodigo ?? (opciones.leer === undefined ? compiladorDeCodigo(workspace).compilar : undefined);
  const bundles = await shell();
  const vivo: WorkspaceVivo = await abrirWorkspaceVivo({
    puerto: puertoDeDisco(opciones),
    raiz: resolve(workspace),
    confiarEnCodigo,
    ...(debounceMs !== undefined && { debounceMs }),
    ...(compilarCodigo !== undefined && { compilarCodigo }),
  });

  const clientes = new Set<ServerResponse>();
  const enviarEstado = (cliente: ServerResponse, estado: EstadoDeDev): void => void cliente.write(`data: ${JSON.stringify(estado)}\n\n`);
  const dejarDeEscuchar = vivo.suscribir((estado) => {
    for (const cliente of clientes) enviarEstado(cliente, estado);
  });

  const hostsPropios = (): string[] => {
    const { port } = servidor.address() as AddressInfo;
    return [`127.0.0.1:${port}`, `localhost:${port}`];
  };

  /** Si el origen, el content-type o el JSON no valen, responde el error y devuelve `undefined`. */
  const leerCuerpoJson = async (req: IncomingMessage, res: ServerResponse): Promise<{ cuerpo: unknown } | undefined> => {
    const origen = req.headers.origin;
    if (origen !== undefined && !hostsPropios().some((host) => origen === `http://${host}`)) {
      responder(res, 403, { ok: false, mensaje: 'Origen no permitido' });
      return undefined;
    }
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      responder(res, 415, { ok: false, mensaje: 'Se esperaba application/json' });
      return undefined;
    }
    try {
      return { cuerpo: JSON.parse(await leerCuerpo(req)) as unknown };
    } catch {
      responder(res, 400, { ok: false, mensaje: 'JSON invalido' });
      return undefined;
    }
  };

  /** Un fallo de `atender` responde 500. */
  const post = (req: IncomingMessage, res: ServerResponse, atender: (cuerpo: unknown) => Promise<void> | void): void => {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      responder(res, 405, { ok: false, mensaje: 'Metodo no permitido' });
      return;
    }
    void leerCuerpoJson(req, res)
      .then((leido) => (leido === undefined ? undefined : atender(leido.cuerpo)))
      .catch((error: unknown) => responder(res, 500, { ok: false, mensaje: (error as Error).message }));
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
      res.end('Host no permitido');
      return;
    }
    const ruta = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (ruta === '/api/edit') {
      post(req, res, async (cuerpo) => {
        const intencion = comoIntencion(cuerpo);
        if (intencion === undefined) responder(res, 400, { ok: false, mensaje: 'Se esperaba una Intencion { tipo, ... }' });
        else responderResultado(res, await vivo.editar(intencion, versionVista(cuerpo)));
      });
    } else if (ruta === '/api/deshacer') {
      post(req, res, async () => responderResultado(res, await vivo.deshacer()));
    } else if (ruta === '/api/rehacer') {
      post(req, res, async () => responderResultado(res, await vivo.rehacer()));
    } else if (ruta === '/api/confiar') {
      post(req, res, () => {
        vivo.confiar();
        responder(res, 200, { ok: true });
      });
    } else if (ruta === '/') {
      cabecera(res, 'text/html');
      res.end(PAGINA);
    } else if (ruta === '/app.js') {
      cabecera(res, 'text/javascript');
      res.end(bundles.pagina);
    } else if (ruta === '/worker.js') {
      cabecera(res, 'text/javascript');
      res.end(bundles.worker);
    } else if (ruta === '/api/codigo') {
      const { componentes, confiado } = vivo.codigo();
      responder(res, 200, { temaConCodigo: componentes.length > 0, componentes, confiado });
    } else if (ruta === '/componentes.js') {
      const { confiado, bundle } = vivo.codigo();
      if (!confiado) {
        cabecera(res, 'text/plain', 403);
        res.end('El codigo del Workspace no esta confirmado');
      } else {
        cabecera(res, 'text/javascript');
        res.end(bundle);
      }
    } else if (ruta.startsWith(RUTA_DE_FUENTES)) {
      const fuente = servirFuente(ruta.slice(RUTA_DE_FUENTES.length));
      if (fuente === undefined) {
        cabecera(res, 'text/plain', 404);
        res.end('No encontrado');
      } else {
        res.writeHead(200, { 'content-type': fuente.tipo, 'cache-control': 'no-store', 'content-length': fuente.bytes.length });
        res.end(fuente.bytes);
      }
    } else if (ruta === '/api/estado') {
      responder(res, 200, vivo.estado());
    } else if (ruta === '/eventos') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clientes.add(res);
      res.on('close', () => clientes.delete(res));
      enviarEstado(res, vivo.estado());
    } else if (ruta.startsWith('/api/vista/')) {
      const id = decodeURIComponent(ruta.slice('/api/vista/'.length));
      vivo.geometria(id).then(
        (geometria) => responder(res, geometria === undefined ? 404 : 200, geometria ?? { error: `Vista '${id}' inexistente` }),
        (error: unknown) => responder(res, 500, { error: (error as Error).message }),
      );
    } else {
      cabecera(res, 'text/plain', 404);
      res.end('No encontrado');
    }
  });

  const detener = (): void => {
    dejarDeEscuchar();
    vivo.cerrar();
  };
  await new Promise<void>((ok, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(puerto, '127.0.0.1', () => ok());
  }).catch((error: unknown) => {
    detener();
    throw error;
  });
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('El servidor no tiene puerto');
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


/** Vuelve con la URL; el servidor mantiene vivo el proceso. Puerto 4173 por defecto. */
export async function comandoDev(
  args: readonly string[],
  dependencias: Pick<OpcionesDeDev, 'leer' | 'observar' | 'shell'> = {},
): Promise<ResultadoDeEjecucion> {
  const uso = usoComun;
  let valores;
  try {
    valores = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, port: { type: 'string' }, 'theme-path': { type: 'string' }, 'trust-code': { type: 'boolean' } }, strict: true }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (valores.workspace === undefined) return uso('Falta --workspace <ruta>');
  const puerto = Number(valores.port ?? 4173);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) return uso('--port debe ser un entero entre 0 y 65535');
  try {
    const servidor = await iniciarDev({ ...dependencias, workspace: valores.workspace, puerto, ...(valores['trust-code'] === true && { confiarEnCodigo: true }), ...(valores['theme-path'] === undefined ? {} : { temas: valores['theme-path'] }) });
    const aviso =
      servidor.conCodigo.length === 0
        ? ''
        : servidor.confiado
          ? `AVISO: los Temas del Workspace cargan codigo (${servidor.conCodigo.join(', ')}); confirmado con --trust-code.\n`
          : `AVISO: los Temas del Workspace cargan codigo (${servidor.conCodigo.join(', ')}) que corre en tu navegador sin sandbox. El visor pedira confirmacion antes de cargarlo; usa --trust-code solo en un Workspace propio.\n`;
    return { exitCode: 0, stdout: `${aviso}diagrams dev escuchando en ${servidor.url}\n`, stderr: '' };
  } catch (error) {
    return uso(`No se pudo iniciar dev: ${(error as Error).message}`);
  }
}
