/**
 * Rutas `/api/*` y `/componentes.js` de `dev` sobre un Workspace vivo, sin transporte: entra una peticion (metodo, URL y
 * cuerpo crudo) y sale siempre una respuesta completa (estado HTTP, cuerpo ya serializado y cabeceras). La usan el servidor real (`cli`)
 * y `devEnMemoria` (`estudio/contrato`), asi que el ruteo, la validacion y los bordes son unos solos (ADR 0007).
 * Bordes: ruta desconocida 404; metodo ajeno 405 con `allow`; JSON o forma invalida 400; rechazos `estadoHttpDeRechazo`
 * (409/422); el bundle de Componentes sin confianza 403; una excepcion (fallo de I/O del puerto) 500 con su mensaje.
 * Todos con `{ ok: false, mensaje }`. El bundle es lo unico que no es JSON (`text/javascript`).
 * Invariantes: nunca rechaza. Al adaptador le quedan solo el transporte y su seguridad (Host, Origin, content-type) y
 * lo demas (estaticos, `/eventos`, fuentes).
 */
import { archivoDeRuta, COMANDOS_DE_INSPECT, estadoHttpDeRechazo, intencionSchema, peticionDeEdicionesSchema, peticionDeSaltoSchema, RUTAS_DE_DEV } from 'canonico';
import type { ComandoDeInspect, Intencion } from 'canonico';

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

/** Rutas POST de la API (exactas). */
const RUTAS_POST: readonly string[] = [RUTAS_DE_DEV.edit, RUTAS_DE_DEV.deshacer, RUTAS_DE_DEV.rehacer, RUTAS_DE_DEV.saltar, RUTAS_DE_DEV.confiar];
/** Rutas GET de la API: exactas y prefijos (`<prefijo><argumento>`). */
const RUTAS_GET: readonly string[] = [RUTAS_DE_DEV.estado, RUTAS_DE_DEV.archivos, RUTAS_DE_DEV.codigo, RUTAS_DE_DEV.componentes];
const PREFIJOS_GET: readonly string[] = [RUTAS_DE_DEV.archivo, RUTAS_DE_DEV.inspect, RUTAS_DE_DEV.vista];
const esRutaGet = (ruta: string): boolean => RUTAS_GET.includes(ruta) || PREFIJOS_GET.some((prefijo) => ruta.startsWith(prefijo));

/** Respuesta interna antes de serializar; `javascript` va tal cual en vez de `cuerpo`. */
interface Respuesta {
  status: number;
  cuerpo?: unknown;
  javascript?: string;
  cabeceras?: Record<string, string>;
}

const json = (status: number, cuerpo: unknown): Respuesta => ({ status, cuerpo });
const error = (status: number, mensaje: string): Respuesta => json(status, { ok: false, mensaje });

const resultado = (r: ResultadoDelWorkspaceVivo): Respuesta =>
  r.ok ? json(200, r) : json(estadoHttpDeRechazo(r.motivo), { ok: false, motivo: r.motivo, mensaje: r.mensaje, ...(r.file !== undefined && { file: r.file }) });

/** Una Intencion o `{ ediciones, version?, descripcion?, aunqueNoCompile? }` (`PeticionDeEdiciones`); `undefined` es 400. */
export function pedidoDeEdicion(cuerpo: unknown): { aplicable: Intencion | EdicionesDeTexto; version?: number } | undefined {
  if (typeof cuerpo === 'object' && cuerpo !== null && 'ediciones' in cuerpo) {
    const r = peticionDeEdicionesSchema.safeParse(cuerpo);
    if (!r.success) return undefined;
    const { ediciones, version, descripcion, aunqueNoCompile } = r.data;
    return { aplicable: { ediciones, ...(descripcion !== undefined && { descripcion }), ...(aunqueNoCompile === true && { aunqueNoCompile }) }, ...(version !== undefined && { version }) };
  }
  const r = intencionSchema.safeParse(cuerpo);
  if (!r.success) return undefined;
  const version = (cuerpo as { version?: unknown }).version;
  return { aplicable: r.data, ...(typeof version === 'number' && Number.isInteger(version) && version >= 0 && { version }) };
}

/** `/api/inspect/<comando>/<argumento>[?tipo&estado&diagrama&catalogo]` como Consulta; `undefined` si no encaja. */
export function consultaDeRuta(url: URL): Consulta | undefined {
  const [comando, codificado, ...sobra] = url.pathname.slice(RUTAS_DE_DEV.inspect.length).split('/');
  let argumento: string | undefined;
  try {
    argumento = codificado === undefined ? undefined : decodeURIComponent(codificado);
  } catch {
    argumento = undefined;
  }
  if (comando === undefined || !(COMANDOS_DE_INSPECT as readonly string[]).includes(comando) || argumento === undefined || argumento === '' || sobra.length > 0) return undefined;
  if (comando !== 'tema') return { comando: comando as Exclude<ComandoDeInspect, 'tema'>, argumento };
  const opcion = (clave: 'tipo' | 'estado' | 'diagrama'): { [k: string]: string } => {
    const valor = url.searchParams.get(clave);
    return valor === null ? {} : { [clave]: valor };
  };
  return { comando, argumento, ...opcion('tipo'), ...opcion('estado'), ...opcion('diagrama'), catalogo: url.searchParams.get('catalogo') === 'true' };
}

async function post(vivo: WorkspaceVivo, ruta: string, cuerpo: unknown): Promise<Respuesta | undefined> {
  if (ruta === RUTAS_DE_DEV.edit) {
    const pedido = pedidoDeEdicion(cuerpo);
    if (pedido === undefined) return json(400, { ok: false, mensaje: 'Se esperaba una Intencion { tipo, ... } o { ediciones, version, descripcion? }' });
    return resultado(await vivo.editar(pedido.aplicable, pedido.version));
  }
  if (ruta === RUTAS_DE_DEV.deshacer) return resultado(await vivo.deshacer());
  if (ruta === RUTAS_DE_DEV.rehacer) return resultado(await vivo.rehacer());
  if (ruta === RUTAS_DE_DEV.saltar) {
    const salto = peticionDeSaltoSchema.safeParse(cuerpo);
    if (!salto.success) return json(400, { ok: false, mensaje: 'Se esperaba { id } con un entero no negativo' });
    return resultado(await vivo.saltar(salto.data.id));
  }
  if (ruta === RUTAS_DE_DEV.confiar) {
    vivo.confiar();
    return json(200, { ok: true });
  }
  return undefined;
}

async function get(vivo: WorkspaceVivo, url: URL): Promise<Respuesta | undefined> {
  const ruta = url.pathname;
  if (ruta === RUTAS_DE_DEV.estado) return json(200, vivo.estado());
  if (ruta === RUTAS_DE_DEV.archivos) return json(200, vivo.archivos());
  if (ruta.startsWith(RUTAS_DE_DEV.archivo)) {
    const file = archivoDeRuta(ruta.slice(RUTAS_DE_DEV.archivo.length));
    const leido = file === undefined ? undefined : vivo.archivo(file);
    return leido === undefined ? error(404, 'Archivo inexistente') : json(200, leido);
  }
  if (ruta === RUTAS_DE_DEV.codigo) {
    const { componentes, confiado } = vivo.codigo();
    return json(200, { temaConCodigo: componentes.length > 0, componentes, confiado });
  }
  if (ruta === RUTAS_DE_DEV.componentes) {
    const { confiado, bundle } = vivo.codigo();
    return confiado ? { status: 200, javascript: bundle } : error(403, 'El codigo del Workspace no esta confirmado');
  }
  if (ruta.startsWith(RUTAS_DE_DEV.inspect)) {
    const consulta = consultaDeRuta(url);
    if (consulta === undefined) return json(404, { ok: false, mensaje: `Ruta de inspect desconocida; se esperaba ${RUTAS_DE_DEV.inspect}<${COMANDOS_DE_INSPECT.join('|')}>/<argumento>`, cercanos: [] });
    const r = vivo.consultar(consulta);
    if (r === undefined) return json(422, { ok: false, mensaje: 'El Workspace tiene errores y nunca compilo; no hay nada que consultar', cercanos: [] });
    return 'noEncontrado' in r ? json(404, { ok: false, mensaje: r.noEncontrado, cercanos: r.cercanos }) : json(200, r.salida);
  }
  if (ruta.startsWith(RUTAS_DE_DEV.vista)) {
    let id: string;
    try {
      id = decodeURIComponent(ruta.slice(RUTAS_DE_DEV.vista.length));
    } catch {
      return error(404, 'Vista inexistente');
    }
    // `?tema=<nombre>`: la Vista con otro Tema (previsualizar), sin cache ni Historial.
    const tema = url.searchParams.get('tema') ?? undefined;
    const geometria = await vivo.geometria(id, tema === undefined ? undefined : { tema });
    return geometria === undefined ? error(404, tema === undefined ? `Vista '${id}' inexistente` : `Vista '${id}' o Tema '${tema}' inexistente`) : json(200, geometria);
  }
  return undefined;
}

function serializar({ status, cuerpo, javascript, cabeceras }: Respuesta): RespuestaDeDev {
  if (javascript !== undefined) return { status, cuerpo: javascript, cabeceras: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', ...cabeceras } };
  return { status, cuerpo: JSON.stringify(cuerpo), cabeceras: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabeceras } };
}

const metodoAjeno = (permitido: 'GET' | 'POST'): Respuesta => ({ ...error(405, 'Metodo no permitido'), cabeceras: { allow: permitido } });

async function atender(vivo: WorkspaceVivo, { metodo, url, cuerpo }: PeticionDeDev): Promise<Respuesta> {
  if (RUTAS_POST.includes(url.pathname)) {
    if (metodo !== 'POST') return metodoAjeno('POST');
    let leido: unknown;
    try {
      leido = JSON.parse(cuerpo ?? '');
    } catch {
      return error(400, 'JSON invalido');
    }
    return (await post(vivo, url.pathname, leido)) ?? error(404, 'No encontrado');
  }
  if (!esRutaGet(url.pathname)) return error(404, 'No encontrado');
  if (metodo !== 'GET' && metodo !== 'HEAD') return metodoAjeno('GET');
  return (await get(vivo, url)) ?? error(404, 'No encontrado');
}

/** Atiende cualquier peticion como ruta de la API; nunca rechaza (una excepcion es 500). */
export async function atenderApiDeDev(vivo: WorkspaceVivo, peticion: PeticionDeDev): Promise<RespuestaDeDev> {
  try {
    return serializar(await atender(vivo, peticion));
  } catch (e) {
    return serializar(error(500, e instanceof Error ? e.message : String(e)));
  }
}
