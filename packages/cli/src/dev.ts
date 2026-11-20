/**
 * Comando `dev`: servidor HTTP solo en 127.0.0.1 que sirve la app de `estudio` (`/` y `/_estudio/*`, leidos del disco en
 * cada peticion y con `no-store`), el estado y la Geometria por Vista, y empuja por SSE (`/eventos`) el estado, el
 * Historial (al conectar y tras cada recompilacion), los Eventos del Registro de actividad (al conectar, los ultimos 50
 * con `previos: true`) y cada Diferencia con su origen. `POST /api/historial/saltar { id }` lleva el Workspace a una
 * entrada del Historial.
 * Seguridad: 403 a todo `Host` distinto de `127.0.0.1:<puerto>` o `localhost:<puerto>` (DNS rebinding); las rutas POST exigen
 * JSON y un `Origin` propio (o ninguno); `/fuentes/<ruta>` solo sirve archivos de fuente bajo la raiz (si no, 404).
 * Edicion: 400 cuerpo invalido, 409 `hash-desactualizado`, 422 el resto de rechazos, 500 fallo de I/O.
 * Errores: `iniciarDev` rechaza si el puerto esta ocupado (sin dejar el observador activo) y lanza si la lectura
 * inicial falla; `run(['dev', ...])` los convierte en codigo 2. Un estatico de `estudio` sin construir es 404 al pedirlo.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, rmSync, unwatchFile, watch, watchFile } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { RUTAS_DE_DEV } from 'canonico';
import type { EstadoDeDev } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { RUTA_DEL_ESTUDIO, activosDelEstudio } from 'estudio';
import type { ActivosDelEstudio } from 'estudio';
import type { ActividadDeDev, NombreDeEventoDeDev } from 'estudio/protocolo';
import { RUTAS_POST_DE_DEV, abrirWorkspaceVivo, atenderApiDeDev } from 'sesion';
import type { PuertoDelWorkspaceVivo, RegistroDeActividad, Reloj, WorkspaceVivo } from 'sesion';

import { compiladorDeCodigo } from './codigo';
import type { ResultadoDeCodigo } from './codigo';
import { leerConTemas, uso as usoComun } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerArchivoDeFuente, leerRecursos as leerRecursosReal, leerWorkspace } from './workspace';

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
  /** Puerto en 127.0.0.1; 0 elige uno libre. */
  puerto?: number;
  /** Espera en ms tras el ultimo cambio antes de recompilar; por defecto `DEBOUNCE_MS`. */
  debounceMs?: number;
  leer?: (raiz: string) => ArchivosDelWorkspace;
  /** Hash de cada recurso vigilado (`.tsx`, fuentes) bajo `raiz`; por defecto lee el disco (o nada si se inyecta `leer`). */
  leerRecursos?: (raiz: string) => Record<string, string>;
  /** Avisa de cualquier cambio bajo `raiz`; devuelve como dejar de observar. */
  observar?: (raiz: string, alCambiar: () => void) => () => void;
  /** Registro de actividad de `raiz`; por defecto `.diagrams/actividad.jsonl` del disco (o ninguno si se inyecta `leer`). */
  actividad?: (raiz: string) => RegistroDeActividad | undefined;
  /** Rutas de los estaticos de la app; por defecto las del build de `estudio`. Se consultan en cada peticion. */
  estudio?: () => ActivosDelEstudio;
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

/** Cada cuanto se mira el registro de actividad en disco. */
const INTERVALO_DEL_REGISTRO_MS = 250;

/**
 * `.diagrams/actividad.jsonl` con un observador propio (el watcher del Workspace ignora carpetas ocultas). Se sondea con
 * `fs.watchFile`, que funciona aunque el archivo aun no exista y ve la rotacion (otro inodo, otro tamano).
 */
function registroEnDisco(raiz: string): RegistroDeActividad {
  const ruta = join(raiz, '.diagrams', 'actividad.jsonl');
  return {
    leer() {
      try {
        return readFileSync(ruta, 'utf8');
      } catch {
        return undefined;
      }
    },
    observar(alCambiar) {
      const oyente = (): void => alCambiar();
      watchFile(ruta, { interval: INTERVALO_DEL_REGISTRO_MS, persistent: false }, oyente);
      return () => unwatchFile(ruta, oyente);
    },
  };
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
  const actividad = (opciones.actividad ?? (opciones.leer === undefined ? registroEnDisco : () => undefined))(workspace);
  return {
    ...(actividad !== undefined && { actividad }),
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

const TIPOS_DE_ESTATICO: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Lee del disco en cada peticion (un rebuild de `estudio` se ve al recargar); ausente -> 404. */
function servirEstatico(res: ServerResponse, ruta: string | undefined): void {
  let bytes: Buffer;
  try {
    if (ruta === undefined) throw new Error('no declarado');
    bytes = readFileSync(ruta);
  } catch {
    cabecera(res, 'text/plain', 404);
    res.end('No encontrado (si falta el build de la app: pnpm --filter estudio build)');
    return;
  }
  cabecera(res, TIPOS_DE_ESTATICO[extname(ruta)] ?? 'application/octet-stream');
  res.end(bytes);
}

/** El codigo de Temas se sirve en `/componentes.js` solo tras `POST /api/confiar` o `confiarEnCodigo`. */
export async function iniciarDev(opciones: OpcionesDeDev): Promise<ServidorDev> {
  const { workspace, temas, puerto = 0, debounceMs, estudio = activosDelEstudio, confiarEnCodigo = false } = opciones;
  // Con `leer` inyectado no hay disco del que compilar codigo.
  const compilarCodigo = opciones.compilarCodigo ?? (opciones.leer === undefined ? compiladorDeCodigo(workspace).compilar : undefined);
  const vivo: WorkspaceVivo = await abrirWorkspaceVivo({
    puerto: puertoDeDisco(opciones),
    raiz: resolve(workspace),
    reloj: relojReal,
    ahora: Date.now,
    confiarEnCodigo,
    ...(debounceMs !== undefined && { debounceMs }),
    ...(compilarCodigo !== undefined && { compilarCodigo }),
  });

  const clientes = new Set<ServerResponse>();
  /** Eventos SSE con nombre (`estado`, y los que declare `estudio/protocolo`). */
  const enviar = (cliente: ServerResponse, nombre: NombreDeEventoDeDev, datos: unknown): void => void cliente.write(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);
  const enviarEstado = (cliente: ServerResponse, estado: EstadoDeDev): void => enviar(cliente, 'estado', estado);
  const enviarActividad = (cliente: ServerResponse, actividad: ActividadDeDev): void => enviar(cliente, 'actividad', actividad);
  const enviarHistorial = (cliente: ServerResponse): void => enviar(cliente, 'historial', vivo.historial());
  // Toda escritura (propia o externa) recompila: el Historial y su alcance viajan con cada estado.
  const dejarDeEscucharEstado = vivo.suscribir((estado) => {
    for (const cliente of clientes) {
      enviarEstado(cliente, estado);
      enviarHistorial(cliente);
    }
  });
  const dejarDeEscucharActividad = vivo.suscribirActividad((eventos) => {
    for (const cliente of clientes) enviarActividad(cliente, { previos: false, eventos });
  });
  const dejarDeEscucharDiferencia = vivo.suscribirDiferencia((diferencia) => {
    for (const cliente of clientes) enviar(cliente, 'diferencia', diferencia);
  });
  const dejarDeEscuchar = (): void => {
    dejarDeEscucharEstado();
    dejarDeEscucharActividad();
    dejarDeEscucharDiferencia();
  };

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

  /** Un fallo de la API (I/O del puerto) responde 500. */
  const api = (res: ServerResponse, peticion: Parameters<typeof atenderApiDeDev>[1]): void => {
    void atenderApiDeDev(vivo, peticion)
      .then((r) => {
        if (r === undefined) {
          cabecera(res, 'text/plain', 404);
          res.end('No encontrado');
        } else responder(res, r.status, r.cuerpo);
      })
      .catch((error: unknown) => responder(res, 500, { ok: false, mensaje: (error as Error).message }));
  };

  /** Las rutas POST exigen POST, un `Origin` propio y JSON (si no, responde el error). */
  const post = (req: IncomingMessage, res: ServerResponse, url: URL): void => {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      responder(res, 405, { ok: false, mensaje: 'Metodo no permitido' });
      return;
    }
    void leerCuerpoJson(req, res).then(
      (leido) => (leido === undefined ? undefined : api(res, { metodo: 'POST', url, cuerpo: leido.cuerpo })),
      (error: unknown) => responder(res, 500, { ok: false, mensaje: (error as Error).message }),
    );
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
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const ruta = url.pathname;
    if (RUTAS_POST_DE_DEV.includes(ruta)) {
      post(req, res, url);
    } else if (ruta === '/') {
      servirEstatico(res, estudio().indice);
    } else if (ruta.startsWith(RUTA_DEL_ESTUDIO)) {
      const { archivos } = estudio();
      const nombre = ruta.slice(RUTA_DEL_ESTUDIO.length);
      servirEstatico(res, Object.hasOwn(archivos, nombre) ? archivos[nombre] : undefined);
    } else if (ruta === RUTAS_DE_DEV.componentes) {
      const { confiado, bundle } = vivo.codigo();
      if (!confiado) {
        cabecera(res, 'text/plain', 403);
        res.end('El codigo del Workspace no esta confirmado');
      } else {
        cabecera(res, 'text/javascript');
        res.end(bundle);
      }
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
      enviarEstado(res, vivo.estado());
      enviarHistorial(res);
      enviarActividad(res, { previos: true, eventos: [...vivo.actividad()] });
    } else {
      api(res, { metodo: req.method ?? 'GET', url });
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
  dependencias: Pick<OpcionesDeDev, 'leer' | 'observar' | 'estudio'> = {},
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
