/**
 * Comando `dev` (ADR 0005): servidor HTTP de Node, solo en 127.0.0.1, que sirve
 * el shell, el estado del Workspace y la geometria por Vista, y empuja los
 * cambios por Server-Sent Events. La tuberia compilar, validar y layout es la
 * `Sesion`; aqui solo viven los adaptadores (HTTP, observador de disco).
 *
 * Rutas: `/` (pagina), `/app.js` y `/worker.js` (bundles del shell),
 * `/api/estado` (JSON con la forma de `estadoDeDevSchema` de `canonico`, con `hashes` por archivo y `archivosDeVista`: el archivo de cada Vista, cuyo hash va en `POST /api/pin`), `POST /api/edit` (puerta de edicion unica: cualquier Intencion, ADR 0007), `POST /api/pin` (mover un Pin, cuerpo sin `tipo`, ADR 0005), `POST /api/deshacer` y `POST /api/rehacer` (restauran el texto exacto del historial del servidor, ADR 0007; 409 si el disco cambio fuera de dev, 422 con motivo `nada-que-deshacer` / `nada-que-rehacer` si no hay nada), `/api/vista/<id>` (geometria cacheada), `/eventos` (SSE;
 * envia el estado al conectar y tras cada recompilacion).
 *
 * `iniciarDev(OpcionesDeDev) -> ServidorDev` es la entrada programatica (el comando solo parsea y la llama).
 * `OpcionesDeDev`: `workspace` (obligatorio), `temas` (= `--theme-path`, se fusiona antes del Workspace,
 * no se observa y nunca se escribe), `puerto` (0 elige uno libre), `debounceMs` y los seams `leer`,
 * `observar`, `shell`, `escribir` y `borrar`. `ServidorDev`: `url` y `cerrar()` (cierra conexiones, libera el
 * puerto y deja de observar).
 * Seguridad: solo escucha en 127.0.0.1 y responde 403 a cualquier peticion cuyo `Host` no sea
 * `127.0.0.1:<puerto>` o `localhost:<puerto>` (DNS rebinding). Las dos rutas de edicion solo escriben archivos
 * del Workspace, bajo su raiz y de forma atomica; validan el cuerpo con `intencionSchema` / `intencionDePinSchema` de
 * `canonico` (400; `/api/pin` con `Se esperaba { vista, nodo, x, y, hash }`) y traduce cada `MotivoDeRechazo` a su
 * Estado con la tabla unica `SALIDA_DE_RECHAZO` (409 solo `hash-desactualizado`, 422 el resto).
 * Errores: `iniciarDev` rechaza si el puerto esta ocupado o el shell no se empaqueta (sin dejar el
 * observador activo) y lanza si la lectura inicial falla; las lecturas fallidas posteriores se ignoran
 * hasta el siguiente cambio. `run(['dev', ...])` los convierte en codigo 2.
 *
 * Invariantes: las peticiones de edicion, deshacer y rehacer se serializan en una cola; una escritura que falla a mitad se revierte; gana la ultima escritura. Las
 * recompilaciones se agrupan con debounce y se serializan. Si el Workspace
 * tiene errores, el estado lleva los issues pero conserva la Fuente y la
 * geometria de la ultima Sesion sin errores (la Vista previa se conserva).
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rmSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { combineIconProviders, genericIcons, intencionDePinSchema, intencionSchema, serializarIconos, workspaceIcons } from 'canonico';
import type { EstadoDeDev, Intencion, Issue } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { abrirSesion, aplicarAlWorkspace, apilar, archivoDeVista, crearHistorial, deshacer, hashDeContenido, rehacer } from 'sesion';
import type { Historial, Sesion } from 'sesion';

import { empaquetarShellDev } from './dev-shell';
import { SALIDA_DE_RECHAZO, rechazoDeEdicion } from './rechazos';
import { leerConTemas, uso as usoComun } from './sesion-cli';
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
  /** Escribe un archivo del Workspace (ruta relativa a `raiz`); lo usan las rutas de edicion y de deshacer/rehacer. */
  escribir?: (raiz: string, ruta: string, texto: string) => void;
  /** Borra un archivo del Workspace (ruta relativa a `raiz`); deshacer/rehacer lo usan para quitar archivos que creo una edicion. */
  borrar?: (raiz: string, ruta: string) => void;
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

/** Borrado real: siempre bajo la raiz del Workspace; un archivo ya ausente no es error. */
function borrarEnDisco(raiz: string, ruta: string): void {
  rmSync(destinoEnWorkspace(raiz, ruta), { force: true });
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
  const { workspace, temas, puerto = 0, debounceMs = 150, leer: leerBase = leerWorkspace, observar = observarDisco, shell = empaquetarShellDev, escribir = escribirEnDisco, borrar = borrarEnDisco } = opciones;
  const raizAbsoluta = resolve(workspace);
  const leer = (raiz: string): ArchivosDelWorkspace => leerConTemas(leerBase, raiz, temas);
  const bundles = await shell();

  let version = 0;
  let archivos = leer(workspace);
  let actual: Sesion = abrirSesion(archivos);
  /** Ultima Sesion sin errores de compilacion y los archivos con que se abrio. */
  let buena: { sesion: Sesion; archivos: ArchivosDelWorkspace } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos };
  let issues: Issue[] = await actual.diagnosticar();
  let estado = construirEstado();

  const clientes = new Set<ServerResponse>();

  /** Historial de deshacer/rehacer del texto propio del Workspace (ADR 0007); vive mientras viva el servidor. */
  let historial: Historial | undefined;
  /** Cola simple: las peticiones de edicion/deshacer/rehacer se ejecutan una tras otra. */
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  };
  /** Deja el disco con el texto de `destino` (escribe lo distinto o nuevo, borra lo sobrante); si falla a mitad revierte a `origen` y relanza. */
  const dejarEnDisco = (origen: ArchivosDelWorkspace, destino: ArchivosDelWorkspace): void => {
    const aEscribir = Object.keys(destino).filter((r) => destino[r] !== origen[r]).sort();
    const aBorrar = Object.keys(origen).filter((r) => !(r in destino)).sort();
    const tocadas: string[] = [];
    try {
      for (const ruta of aEscribir) {
        tocadas.push(ruta);
        escribir(workspace, ruta, destino[ruta] as string);
      }
      for (const ruta of aBorrar) {
        tocadas.push(ruta);
        borrar(workspace, ruta);
      }
    } catch (error) {
      revertir(origen, tocadas);
      throw error;
    }
  };
  /** Restaura en disco, sin interrumpirse por nuevos fallos, las `rutas` al texto de `origen` (o las borra si no existian). */
  const revertir = (origen: ArchivosDelWorkspace, rutas: readonly string[]): void => {
    for (const ruta of rutas) {
      try {
        if (ruta in origen) escribir(workspace, ruta, origen[ruta] as string);
        else borrar(workspace, ruta);
      } catch {
        // mejor esfuerzo: si el disco sigue fallando, el siguiente deshacer/rehacer detecta la diferencia (409) y reinicia el historial
      }
    }
  };
  const mismoTexto = (a: ArchivosDelWorkspace, b: ArchivosDelWorkspace): boolean => {
    const claves = Object.keys(a);
    return claves.length === Object.keys(b).length && claves.every((k) => a[k] === b[k]);
  };

  /** Estado vigente con la forma de `estadoDeDevSchema` (`canonico`), el esquema unico servidor-navegador. */
  function construirEstado(): EstadoDeDev {
    const fuente = buena?.sesion.fuente;
    const proveedor = buena === undefined ? undefined : combineIconProviders(workspaceIcons(buena.archivos), genericIcons());
    const iconos = proveedor === undefined ? {} : serializarIconos(proveedor);
    return {
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
    };
  }

  const empujar = (): void => {
    for (const cliente of clientes) cliente.write(`data: ${JSON.stringify(estado)}\n\n`);
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
        estado = construirEstado();
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

  /** Origen, content-type y JSON validos para cualquier ruta de escritura; si no, responde el error y devuelve `undefined`. */
  const leerCuerpoJson = async (req: IncomingMessage, res: ServerResponse): Promise<{ cuerpo: unknown } | undefined> => {
    const origen = req.headers.origin;
    const { port } = servidor.address() as AddressInfo;
    if (origen !== undefined && origen !== `http://127.0.0.1:${port}` && origen !== `http://localhost:${port}`) {
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

  /**
   * Puerta de edicion unica (ADR 0007): `POST /api/edit` recibe cualquier Intencion y `POST /api/pin`
   * (compatibilidad, cuerpo sin `tipo`) la traduce a `mover-pin`. `dev` solo hace de enrutador HTTP:
   * valida origen y cuerpo, delega en `aplicarAlWorkspace` de `sesion` y traduce el motivo con `SALIDA_DE_RECHAZO`.
   */
  const editar = async (req: IncomingMessage, res: ServerResponse, leerIntencion: (cuerpo: unknown) => Intencion | undefined, esperado: string): Promise<void> => {
    const leido = await leerCuerpoJson(req, res);
    if (leido === undefined) return;
    const intencion = leerIntencion(leido.cuerpo);
    if (intencion === undefined) {
      responder(res, 400, { ok: false, mensaje: esperado });
      return;
    }
    // Adaptador del Workspace: lee fresco del disco y escribe solo bajo la raiz (los Temas de `--theme-path` no se tocan).
    let resultado;
    let antes: ArchivosDelWorkspace = {};
    const escritas: string[] = [];
    try {
      antes = leerBase(workspace);
      resultado = aplicarAlWorkspace(
        {
          leer: () => ({ propios: leerBase(workspace), disco: leerConTemas(leerBase, workspace, temas) }),
          escribir: (ruta, texto) => {
            escritas.push(ruta);
            escribir(workspace, ruta, texto);
          },
        },
        intencion,
      );
    } catch (error) {
      revertir(antes, escritas);
      responder(res, 500, { ok: false, mensaje: (error as Error).message });
      return;
    }
    if (!resultado.ok) {
      responder(res, SALIDA_DE_RECHAZO[resultado.motivo].estadoHttp, rechazoDeEdicion(resultado.motivo, resultado.mensaje, resultado.file));
      return;
    }
    // Si el texto ya no es el del historial (se edito fuera de dev), el historial vuelve a empezar desde ahi.
    const despues = leerBase(workspace);
    if (!mismoTexto(antes, despues)) {
      const base = historial !== undefined && mismoTexto(historial.archivos, antes) ? historial : crearHistorial(antes);
      historial = apilar(base, despues);
    }
    await recompilar();
    responder(res, 200, { ok: true, version });
  };

  /**
   * `POST /api/deshacer` y `/api/rehacer`: dejan en disco el texto exacto de la instantanea (ADR 0007),
   * incluidos los archivos que la edicion creo o borro. Si el texto del disco ya no coincide con el del
   * historial (edicion externa), 409 y el historial se descarta. Si la escritura falla, se revierte.
   */
  const restaurarHistorial = async (req: IncomingMessage, res: ServerResponse, mover: (h: Historial) => Historial | undefined, motivoSinHistorial: 'nada-que-deshacer' | 'nada-que-rehacer'): Promise<void> => {
    if ((await leerCuerpoJson(req, res)) === undefined) return;
    const disco = leerBase(workspace);
    if (historial === undefined) historial = crearHistorial(disco);
    if (!mismoTexto(historial.archivos, disco)) {
      historial = crearHistorial(disco);
      responder(res, 409, rechazoDeEdicion('hash-desactualizado', 'El Workspace cambio fuera de dev; no hay historial que restaurar'));
      return;
    }
    const siguiente = mover(historial);
    if (siguiente === undefined) {
      responder(res, SALIDA_DE_RECHAZO[motivoSinHistorial].estadoHttp, rechazoDeEdicion(motivoSinHistorial, motivoSinHistorial === 'nada-que-deshacer' ? 'Nada que deshacer' : 'Nada que rehacer'));
      return;
    }
    try {
      dejarEnDisco(disco, siguiente.archivos);
    } catch (error) {
      responder(res, 500, { ok: false, mensaje: (error as Error).message });
      return;
    }
    historial = siguiente;
    await recompilar();
    responder(res, 200, { ok: true, version });
  };

  const comoIntencion = (cuerpo: unknown): Intencion | undefined => {
    const r = intencionSchema.safeParse(cuerpo);
    return r.success ? r.data : undefined;
  };
  const comoMoverPin = (cuerpo: unknown): Intencion | undefined => {
    const r = intencionDePinSchema.safeParse(cuerpo);
    return r.success ? { tipo: 'mover-pin', ...r.data } : undefined;
  };
  const rutasDeEdicion = {
    '/api/edit': { leer: comoIntencion, esperado: 'Se esperaba una Intencion { tipo, ... }' },
    '/api/pin': { leer: comoMoverPin, esperado: 'Se esperaba { vista, nodo, x, y, hash }' },
  } as const;

  const servidor = createServer((req, res) => {
    // Contra DNS rebinding: solo se atiende a quien llega por 127.0.0.1 o localhost con el puerto del servidor.
    const { port } = servidor.address() as AddressInfo;
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      cabecera(res, 'text/plain', 403);
      res.end('Host no permitido');
      return;
    }
    const ruta = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const rutaDeHistorial =
      ruta === '/api/deshacer' ? ({ mover: deshacer, motivoSinHistorial: 'nada-que-deshacer' } as const) : ruta === '/api/rehacer' ? ({ mover: rehacer, motivoSinHistorial: 'nada-que-rehacer' } as const) : undefined;
    const edicion = ruta === '/api/edit' || ruta === '/api/pin' ? rutasDeEdicion[ruta] : undefined;
    if (edicion !== undefined || rutaDeHistorial !== undefined) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST');
        responder(res, 405, { ok: false, mensaje: 'Metodo no permitido' });
      } else {
        enCola(() => (edicion === undefined ? restaurarHistorial(req, res, rutaDeHistorial!.mover, rutaDeHistorial!.motivoSinHistorial) : editar(req, res, edicion.leer, edicion.esperado))).catch((error: unknown) => responder(res, 500, { ok: false, mensaje: (error as Error).message }));
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
      res.end(JSON.stringify(estado));
    } else if (ruta === '/eventos') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clientes.add(res);
      res.on('close', () => clientes.delete(res));
      res.write(`data: ${JSON.stringify(estado)}\n\n`);
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
