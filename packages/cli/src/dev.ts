/**
 * Comando `dev` (ADR 0005): servidor HTTP de Node, solo en 127.0.0.1, que sirve
 * el shell, el estado del Workspace y la geometria por Vista, y empuja los
 * cambios por Server-Sent Events. La tuberia compilar, validar y layout es la
 * `Sesion`; aqui solo viven los adaptadores (HTTP, observador de disco).
 *
 * Rutas: `/` (pagina), `/app.js` y `/worker.js` (bundles del shell),
 * `/api/estado` (JSON, con `hashes` por archivo y `archivosDeVista`: el archivo de cada Vista, cuyo hash va en `POST /api/pin`), `POST /api/pin` (mover un Pin, ADR 0005), `/api/vista/<id>` (geometria cacheada), `/eventos` (SSE;
 * envia el estado al conectar y tras cada recompilacion).
 *
 * `iniciarDev(OpcionesDeDev) -> ServidorDev` es la entrada programatica (el comando solo parsea y la llama).
 * `OpcionesDeDev`: `workspace` (obligatorio), `temas` (= `--theme-path`, se fusiona antes del Workspace,
 * no se observa y nunca se escribe), `puerto` (0 elige uno libre), `debounceMs` y los seams `leer`,
 * `observar`, `shell` y `escribir`. `ServidorDev`: `url` y `cerrar()` (cierra conexiones, libera el
 * puerto y deja de observar).
 * Seguridad: solo escucha en 127.0.0.1 y responde 403 a cualquier peticion cuyo `Host` no sea
 * `127.0.0.1:<puerto>` o `localhost:<puerto>` (DNS rebinding). `POST /api/pin` solo escribe archivos
 * del Workspace, bajo su raiz y de forma atomica; valida el cuerpo con `intencionDePinSchema` de
 * `canonico` (400 con `Se esperaba { vista, nodo, x, y, hash }`) y traduce cada `MotivoDeRechazo` a su
 * Estado con la tabla unica `SALIDA_DE_RECHAZO` (409 solo `hash-desactualizado`, 422 el resto).
 * Errores: `iniciarDev` rechaza si el puerto esta ocupado o el shell no se empaqueta (sin dejar el
 * observador activo) y lanza si la lectura inicial falla; las lecturas fallidas posteriores se ignoran
 * hasta el siguiente cambio. `run(['dev', ...])` los convierte en codigo 2.
 *
 * Invariantes: sin bloqueos ni estado compartido; gana la ultima escritura. Las
 * recompilaciones se agrupan con debounce y se serializan. Si el Workspace
 * tiene errores, el estado lleva los issues pero conserva la Fuente y la
 * geometria de la ultima Sesion sin errores (la Vista previa se conserva).
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { combineIconProviders, genericIcons, intencionDePinSchema, workspaceIcons } from 'canonico';
import type { Issue } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { abrirSesion, archivoDeVista, editarPin, hashDeContenido } from 'sesion';
import type { Sesion } from 'sesion';

import { empaquetarShellDev } from './dev-shell';
import { SALIDA_DE_RECHAZO, rechazoDeEdicion } from './rechazos';
import { cambiosDeEdicion, leerConTemas, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerWorkspace } from './workspace';

/** Bundles del shell: pagina (React + shell) y codigo del Web Worker de layout. */
export interface ShellDev {
  pagina: string;
  worker: string;
}

export interface OpcionesDeDev {
  workspace: string;
  /** Carpeta de Temas (`--theme-path`): se fusiona antes del Workspace, que gana en rutas repetidas. No se observa. */
  temas?: string;
  /** Puerto en 127.0.0.1; 0 elige uno libre. */
  puerto?: number;
  /** Espera tras el ultimo cambio antes de recompilar (150 ms por defecto). */
  debounceMs?: number;
  leer?: (raiz: string) => ArchivosDelWorkspace;
  /** Avisa de cualquier cambio bajo `raiz`; devuelve como dejar de observar. */
  observar?: (raiz: string, alCambiar: () => void) => () => void;
  shell?: () => Promise<ShellDev>;
  /** Escribe un archivo del Workspace (ruta relativa a `raiz`); solo lo usa `POST /api/pin`. */
  escribir?: (raiz: string, ruta: string, texto: string) => void;
}

export interface ServidorDev {
  /** `http://127.0.0.1:<puerto>/` */
  url: string;
  cerrar(): Promise<void>;
}

/** Observador real: `fs.watch` recursivo, ignorando carpetas ocultas (`.diagrams/`, `.git/`). */
function observarDisco(raiz: string, alCambiar: () => void): () => void {
  const observador = watch(raiz, { recursive: true }, (_evento, nombre) => {
    if (nombre !== null && nombre.split(/[\\/]/).some((parte) => parte.startsWith('.') || parte === 'node_modules')) return;
    alCambiar();
  });
  return () => observador.close();
}

/** Escritura real: atomica y siempre bajo la raiz del Workspace. */
function escribirEnDisco(raiz: string, ruta: string, texto: string): void {
  escribirTexto(destinoEnWorkspace(raiz, ruta), texto);
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

export async function iniciarDev(opciones: OpcionesDeDev): Promise<ServidorDev> {
  const { workspace, temas, puerto = 0, debounceMs = 150, leer: leerBase = leerWorkspace, observar = observarDisco, shell = empaquetarShellDev, escribir = escribirEnDisco } = opciones;
  const raizAbsoluta = resolve(workspace);
  const leer = (raiz: string): ArchivosDelWorkspace => leerConTemas(leerBase, raiz, temas);
  const bundles = await shell();

  let version = 0;
  let archivos = leer(workspace);
  let actual: Sesion = abrirSesion(archivos);
  /** Ultima Sesion sin errores de compilacion y los archivos con que se abrio. */
  let buena: { sesion: Sesion; archivos: ArchivosDelWorkspace } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos };
  let issues: Issue[] = await actual.diagnosticar();
  let estado = serializar();

  const clientes = new Set<ServerResponse>();

  function serializar(): string {
    const fuente = buena?.sesion.fuente;
    const proveedor = buena === undefined ? undefined : combineIconProviders(workspaceIcons(buena.archivos), genericIcons());
    const iconos = Object.fromEntries(
      (proveedor?.keys().sort() ?? []).flatMap((clave) => {
        const svg = proveedor?.resolve(clave);
        return svg === undefined ? [] : [[clave, svg] as const];
      }),
    );
    return JSON.stringify({
      version,
      fuente,
      iconos,
      vistas: fuente?.views.map(({ id }) => id) ?? [],
      archivosDeVista: Object.fromEntries(
        (fuente?.views ?? []).flatMap(({ id }) => {
          const archivo = buena === undefined ? undefined : archivoDeVista(buena.sesion, id);
          return archivo === undefined ? [] : [[id, archivo] as const];
        }),
      ),
      hashes: Object.fromEntries(Object.entries(archivos).map(([ruta, texto]) => [ruta, hashDeContenido(texto)])),
      issues: issues.map((issue) => ({
        ...issue,
        href: `vscode://file/${raizAbsoluta}/${issue.file}:${issue.line}:${issue.column}`,
      })),
    });
  }

  const empujar = (): void => {
    for (const cliente of clientes) cliente.write(`data: ${estado}\n\n`);
  };

  // Recompilaciones serializadas: si llega un cambio durante una, se repite al terminar.
  let recompilando = false;
  let pendiente = false;
  const recompilar = async (): Promise<void> => {
    if (recompilando) {
      pendiente = true;
      return;
    }
    recompilando = true;
    try {
      do {
        pendiente = false;
        let nuevos: ArchivosDelWorkspace;
        try {
          nuevos = leer(workspace);
        } catch {
          continue; // lectura a medias (archivo en reescritura): el siguiente evento reintenta
        }
        const sesion = (buena?.sesion ?? actual).actualizar(nuevos);
        const nuevosIssues = await sesion.diagnosticar();
        actual = sesion;
        archivos = nuevos;
        if (sesion.fuente !== undefined) buena = { sesion, archivos: nuevos };
        issues = nuevosIssues;
        version += 1;
        estado = serializar();
        empujar();
      } while (pendiente);
    } finally {
      recompilando = false;
    }
  };

  let temporizador: NodeJS.Timeout | undefined;
  const alCambiar = (): void => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void recompilar().catch(() => undefined), debounceMs);
  };
  const dejarDeObservar = observar(workspace, alCambiar);

  const responder = (res: ServerResponse, estadoHttp: number, cuerpo: unknown): void => {
    cabecera(res, 'application/json', estadoHttp);
    res.end(JSON.stringify(cuerpo));
  };

  /** `POST /api/pin`: mueve un Pin escribiendo el .dg (ADR 0005). Lee el disco fresco y lo valida antes de escribir. */
  const moverPin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origen = req.headers.origin;
    const { port } = servidor.address() as AddressInfo;
    if (origen !== undefined && origen !== `http://127.0.0.1:${port}` && origen !== `http://localhost:${port}`) {
      responder(res, 403, { ok: false, mensaje: 'Origen no permitido' });
      return;
    }
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      responder(res, 415, { ok: false, mensaje: 'Se esperaba application/json' });
      return;
    }
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(await leerCuerpo(req));
    } catch {
      responder(res, 400, { ok: false, mensaje: 'JSON invalido' });
      return;
    }
    const parseo = intencionDePinSchema.safeParse(cuerpo);
    if (!parseo.success) {
      responder(res, 400, { ok: false, mensaje: 'Se esperaba { vista, nodo, x, y, hash }' });
      return;
    }
    let disco: ArchivosDelWorkspace;
    let propios: ArchivosDelWorkspace;
    try {
      propios = leerBase(workspace);
      disco = leerConTemas(leerBase, workspace, temas);
    } catch (error) {
      responder(res, 500, { ok: false, mensaje: (error as Error).message });
      return;
    }
    // El Gesto de `sesion` fusa calcular, auto-probar y aplicar en memoria; aqui solo queda el epilogo de I/O.
    const gesta = editarPin(disco, parseo.data);
    if (!gesta.ok) {
      responder(res, SALIDA_DE_RECHAZO[gesta.motivo].estadoHttp, gesta);
      return;
    }
    // Solo se escribe en la raiz del Workspace; los archivos de `--theme-path` no se tocan.
    const { cambiados, fuera } = cambiosDeEdicion(disco, gesta.archivos, propios);
    if (fuera !== undefined) {
      responder(
        res,
        SALIDA_DE_RECHAZO['archivo-desconocido'].estadoHttp,
        rechazoDeEdicion('archivo-desconocido', `'${fuera}' no pertenece al Workspace`, fuera),
      );
      return;
    }
    try {
      for (const ruta of cambiados) escribir(workspace, ruta, gesta.archivos[ruta] as string);
    } catch (error) {
      responder(res, 500, { ok: false, mensaje: (error as Error).message });
      return;
    }
    await recompilar();
    responder(res, 200, { ok: true, version });
  };

  const servidor = createServer((req, res) => {
    // Contra DNS rebinding: solo se atiende a quien llega por 127.0.0.1 o localhost con el puerto del servidor.
    const { port } = servidor.address() as AddressInfo;
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      cabecera(res, 'text/plain', 403);
      res.end('Host no permitido');
      return;
    }
    const ruta = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (ruta === '/api/pin') {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST');
        responder(res, 405, { ok: false, mensaje: 'Metodo no permitido' });
      } else {
        moverPin(req, res).catch((error: unknown) => responder(res, 500, { ok: false, mensaje: (error as Error).message }));
      }
    } else if (ruta === '/') {
      cabecera(res, 'text/html');
      res.end(PAGINA);
    } else if (ruta === '/app.js') {
      cabecera(res, 'text/javascript');
      res.end(bundles.pagina);
    } else if (ruta === '/worker.js') {
      cabecera(res, 'text/javascript');
      res.end(bundles.worker);
    } else if (ruta === '/api/estado') {
      cabecera(res, 'application/json');
      res.end(estado);
    } else if (ruta === '/eventos') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clientes.add(res);
      res.on('close', () => clientes.delete(res));
      res.write(`data: ${estado}\n\n`);
    } else if (ruta.startsWith('/api/vista/')) {
      const id = decodeURIComponent(ruta.slice('/api/vista/'.length));
      (buena?.sesion.geometria(id) ?? Promise.resolve(undefined)).then(
        (geometria) => {
          cabecera(res, 'application/json', geometria === undefined ? 404 : 200);
          res.end(JSON.stringify(geometria ?? { error: `Vista '${id}' inexistente` }));
        },
        (error: unknown) => {
          cabecera(res, 'application/json', 500);
          res.end(JSON.stringify({ error: (error as Error).message }));
        },
      );
    } else {
      cabecera(res, 'text/plain', 404);
      res.end('No encontrado');
    }
  });

  await new Promise<void>((ok, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(puerto, '127.0.0.1', () => ok());
  }).catch((error: unknown) => {
    dejarDeObservar();
    throw error;
  });
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('El servidor no tiene puerto');

  return {
    url: `http://127.0.0.1:${direccion.port}/`,
    cerrar: () =>
      new Promise<void>((ok) => {
        clearTimeout(temporizador);
        dejarDeObservar();
        servidor.close(() => ok());
        servidor.closeAllConnections();
      }),
  };
}

/**
 * `dev --workspace <ruta> [--port N] [--theme-path <carpeta>]`: arranca el servidor y vuelve con la URL;
 * el servidor mantiene vivo el proceso hasta que se mata.
 */
export async function comandoDev(
  args: readonly string[],
  dependencias: Pick<OpcionesDeDev, 'leer' | 'observar' | 'shell'> = {},
): Promise<ResultadoDeEjecucion> {
  const uso = usoComun;
  let valores;
  try {
    valores = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, port: { type: 'string' }, 'theme-path': { type: 'string' } }, strict: true }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (valores.workspace === undefined) return uso('Falta --workspace <ruta>');
  const puerto = Number(valores.port ?? 4173);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) return uso('--port debe ser un entero entre 0 y 65535');
  try {
    const servidor = await iniciarDev({ ...dependencias, workspace: valores.workspace, puerto, ...(valores['theme-path'] === undefined ? {} : { temas: valores['theme-path'] }) });
    return { exitCode: 0, stdout: `diagrams dev escuchando en ${servidor.url}\n`, stderr: '' };
  } catch (error) {
    return uso(`No se pudo iniciar dev: ${(error as Error).message}`);
  }
}
