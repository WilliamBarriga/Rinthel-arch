/**
 * Rutas `/api/*` y `/componentes.js` de `dev` sobre un Workspace vivo, sin transporte: entra una peticion (metodo, URL y
 * cuerpo crudo) y sale siempre una respuesta completa (estado HTTP, cuerpo ya serializado y cabeceras). La usan el servidor real (`cli`)
 * y `devEnMemoria` (`estudio/contrato`), asi que el ruteo, la validacion y los bordes son unos solos (ADR 0007).
 * Bordes: ruta desconocida 404; metodo ajeno 405 con `allow`; JSON o forma invalida 400; rechazos `rejectionHttpStatus`
 * (409/422); el bundle de Componentes sin confianza 403; una excepcion (fallo de I/O del puerto) 500 con su message.
 * Todos con `{ ok: false, message }`. El bundle es lo unico que no es JSON (`text/javascript`).
 * Invariantes: nunca rechaza. Al adaptador le quedan solo el transporte y su seguridad (Host, Origin, content-type) y
 * lo demas (estaticos, `/eventos`, fuentes).
 */
import { fileFromRoute, INSPECT_COMMANDS, rejectionHttpStatus, intentSchema, editsRequestSchema, jumpRequestSchema, DEV_ROUTES } from 'canonical';
import type { InspectCommand, Intent } from 'canonical';

import type { Consulta } from './consultas';
import type { EdicionesDeTexto, ResultadoDelWorkspaceVivo, WorkspaceVivo } from './workspace-vivo';

export interface PeticionDeDev {
  metodo: string;
  url: URL;
  /** Cuerpo crudo (texto); solo lo leen las rutas POST. */
  cuerpo?: string;
}

export interface RespuestaDeDev {
  status: number;
  /** JSON serializado, salvo el bundle de `/componentes.js` (JavaScript). */
  cuerpo: string;
  cabeceras: Readonly<Record<string, string>>;
}

/** Respuesta interna antes de serializar; `javascript` va tal cual en vez de `cuerpo`. */
interface Respuesta {
  status: number;
  cuerpo?: unknown;
  javascript?: string;
  cabeceras?: Record<string, string>;
}

const json = (status: number, cuerpo: unknown): Respuesta => ({ status, cuerpo });
const error = (status: number, message: string): Respuesta => json(status, { ok: false, message });

const resultado = (r: ResultadoDelWorkspaceVivo): Respuesta =>
  r.ok ? json(200, r) : json(rejectionHttpStatus(r.reason), { ok: false, reason: r.reason, message: r.message, ...(r.file !== undefined && { file: r.file }) });

/** Una Intencion o `{ ediciones, version?, descripcion?, aunqueNoCompile? }` (`EditsRequest`); `undefined` es 400. */
export function pedidoDeEdicion(cuerpo: unknown): { aplicable: Intent | EdicionesDeTexto; version?: number } | undefined {
  if (typeof cuerpo === 'object' && cuerpo !== null && 'ediciones' in cuerpo) {
    const r = editsRequestSchema.safeParse(cuerpo);
    if (!r.success) return undefined;
    const { ediciones, version, descripcion, aunqueNoCompile } = r.data;
    return { aplicable: { ediciones, ...(descripcion !== undefined && { descripcion }), ...(aunqueNoCompile === true && { aunqueNoCompile }) }, ...(version !== undefined && { version }) };
  }
  const r = intentSchema.safeParse(cuerpo);
  if (!r.success) return undefined;
  const version = (cuerpo as { version?: unknown }).version;
  return { aplicable: r.data, ...(typeof version === 'number' && Number.isInteger(version) && version >= 0 && { version }) };
}

/** `/api/inspect/<comando>/<argumento>[?kind&state&diagram&catalog]` como Consulta; `undefined` si no encaja. */
export function consultaDeRuta(url: URL): Consulta | undefined {
  const [comando, codificado, ...sobra] = url.pathname.slice(DEV_ROUTES.inspect.length).split('/');
  let argumento: string | undefined;
  try {
    argumento = codificado === undefined ? undefined : decodeURIComponent(codificado);
  } catch {
    argumento = undefined;
  }
  if (comando === undefined || !(INSPECT_COMMANDS as readonly string[]).includes(comando) || sobra.length > 0) return undefined;
  // `planned` no recibe argumento (`/api/inspect/planned/`); el resto lo exige.
  if (comando === 'planned') return argumento === undefined || argumento === '' ? { comando } : undefined;
  if (argumento === undefined || argumento === '') return undefined;
  if (comando !== 'theme') return { comando: comando as Exclude<InspectCommand, 'theme' | 'planned'>, argumento };
  const opcion = (parametro: 'kind' | 'state' | 'diagram', clave: 'tipo' | 'estado' | 'diagrama'): { [k: string]: string } => {
    const valor = url.searchParams.get(parametro);
    return valor === null ? {} : { [clave]: valor };
  };
  return { comando, argumento, ...opcion('kind', 'tipo'), ...opcion('state', 'estado'), ...opcion('diagram', 'diagrama'), catalogo: url.searchParams.get('catalog') === 'true' };
}

/** Una ruta de la API: exacta, o prefijo (`<prefijo><argumento>`) si termina en `/`; `cuerpo` es el JSON ya leido (POST). */
interface Ruta {
  metodo: 'GET' | 'POST';
  ruta: string;
  atender(vivo: WorkspaceVivo, url: URL, cuerpo: unknown): Respuesta | Promise<Respuesta>;
}

/** La tabla unica de rutas: de ella salen el ruteo, el 404 y el 405. */
const RUTAS: readonly Ruta[] = [
  {
    metodo: 'POST',
    ruta: DEV_ROUTES.edit,
    async atender(vivo, _url, cuerpo) {
      const pedido = pedidoDeEdicion(cuerpo);
      if (pedido === undefined) return error(400, 'Expected an Intent { type, ... } or { ediciones, version, descripcion? }');
      return resultado(await vivo.editar(pedido.aplicable, pedido.version));
    },
  },
  { metodo: 'POST', ruta: DEV_ROUTES.undo, atender: async (vivo) => resultado(await vivo.deshacer()) },
  { metodo: 'POST', ruta: DEV_ROUTES.redo, atender: async (vivo) => resultado(await vivo.rehacer()) },
  {
    metodo: 'POST',
    ruta: DEV_ROUTES.jump,
    async atender(vivo, _url, cuerpo) {
      const salto = jumpRequestSchema.safeParse(cuerpo);
      if (!salto.success) return error(400, 'Expected { id } with a non-negative integer');
      return resultado(await vivo.saltar(salto.data.id));
    },
  },
  {
    metodo: 'POST',
    ruta: DEV_ROUTES.trust,
    atender(vivo) {
      vivo.confiar();
      return json(200, { ok: true });
    },
  },
  { metodo: 'GET', ruta: DEV_ROUTES.state, atender: (vivo) => json(200, vivo.estado()) },
  { metodo: 'GET', ruta: DEV_ROUTES.files, atender: (vivo) => json(200, vivo.archivos()) },
  {
    metodo: 'GET',
    ruta: DEV_ROUTES.file,
    atender(vivo, url) {
      const file = fileFromRoute(url.pathname.slice(DEV_ROUTES.file.length));
      const leido = file === undefined ? undefined : vivo.archivo(file);
      return leido === undefined ? error(404, 'File not found') : json(200, leido);
    },
  },
  {
    metodo: 'GET',
    ruta: DEV_ROUTES.code,
    atender(vivo) {
      const { componentes, confiado } = vivo.codigo();
      return json(200, { temaConCodigo: componentes.length > 0, componentes, confiado });
    },
  },
  {
    metodo: 'GET',
    ruta: DEV_ROUTES.components,
    atender(vivo) {
      const { confiado, bundle } = vivo.codigo();
      return confiado ? { status: 200, javascript: bundle } : error(403, 'The Workspace code is not confirmed');
    },
  },
  {
    metodo: 'GET',
    ruta: DEV_ROUTES.inspect,
    atender(vivo, url) {
      const consulta = consultaDeRuta(url);
      if (consulta === undefined) return json(404, { ok: false, message: `Unknown inspect route; expected ${DEV_ROUTES.inspect}<${INSPECT_COMMANDS.join('|')}>/<argumento>`, suggestions: [] });
      const r = vivo.consultar(consulta);
      if (r === undefined) return json(422, { ok: false, message: 'The Workspace has errors and never compiled; there is nothing to query', suggestions: [] });
      return 'noEncontrado' in r ? json(404, { ok: false, message: r.noEncontrado, suggestions: r.suggestions }) : json(200, r.salida);
    },
  },
  {
    metodo: 'GET',
    ruta: DEV_ROUTES.view,
    async atender(vivo, url) {
      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice(DEV_ROUTES.view.length));
      } catch {
        return error(404, 'View not found');
      }
      // `?tema=<nombre>`: la Vista con otro Tema (previsualizar), sin cache ni Historial.
      const tema = url.searchParams.get('tema') ?? undefined;
      const geometria = await vivo.geometria(id, tema === undefined ? undefined : { tema });
      return geometria === undefined ? error(404, tema === undefined ? `View '${id}' not found` : `View '${id}' or Theme '${tema}' not found`) : json(200, geometria);
    },
  },
];

const rutaDe = (camino: string): Ruta | undefined => RUTAS.find(({ ruta }) => (ruta.endsWith('/') ? camino.startsWith(ruta) : camino === ruta));

function serializar({ status, cuerpo, javascript, cabeceras }: Respuesta): RespuestaDeDev {
  if (javascript !== undefined) return { status, cuerpo: javascript, cabeceras: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', ...cabeceras } };
  return { status, cuerpo: JSON.stringify(cuerpo), cabeceras: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabeceras } };
}

const metodoAjeno = (permitido: 'GET' | 'POST'): Respuesta => ({ ...error(405, 'Method not allowed'), cabeceras: { allow: permitido } });

async function atender(vivo: WorkspaceVivo, { metodo, url, cuerpo }: PeticionDeDev): Promise<Respuesta> {
  const ruta = rutaDe(url.pathname);
  if (ruta === undefined) return error(404, 'Not found');
  if (ruta.metodo === 'GET') return metodo === 'GET' || metodo === 'HEAD' ? ruta.atender(vivo, url, undefined) : metodoAjeno('GET');
  if (metodo !== 'POST') return metodoAjeno('POST');
  let leido: unknown;
  try {
    leido = JSON.parse(cuerpo ?? '');
  } catch {
    return error(400, 'Invalid JSON');
  }
  return ruta.atender(vivo, url, leido);
}

/** Atiende cualquier peticion como ruta de la API; nunca rechaza (una excepcion es 500). */
export async function atenderApiDeDev(vivo: WorkspaceVivo, peticion: PeticionDeDev): Promise<RespuestaDeDev> {
  try {
    return serializar(await atender(vivo, peticion));
  } catch (e) {
    return serializar(error(500, e instanceof Error ? e.message : String(e)));
  }
}

/**
 * `fetch` over the dev API in process, without HTTP: every request goes to `atenderApiDeDev`. `base` resolves relative
 * URLs (`/api/estado`). Shared by `export` (it captures the state) and the in-memory dev of the estudio tests.
 */
export function fetchSobreApiDeDev(vivo: WorkspaceVivo, base = 'http://127.0.0.1'): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada instanceof Request ? entrada.url : entrada), base);
    const { status, cuerpo, cabeceras } = await atenderApiDeDev(vivo, { metodo: init?.method ?? 'GET', url, ...(typeof init?.body === 'string' && { cuerpo: init.body }) });
    return new Response(cuerpo, { status, headers: cabeceras });
  }) as typeof fetch;
}
