/**
 * Rutas `/api/*` de `dev` sobre un Workspace vivo, sin transporte: una peticion ya leida (metodo, URL, cuerpo JSON)
 * entra y sale el estado HTTP con su cuerpo. La usan el servidor real (`cli`) y `devEnMemoria` (`estudio/contrato`), asi
 * que las rutas, la validacion y la traduccion de rechazos a HTTP son unas solas (ADR 0007).
 * Invariantes: `undefined` si la ruta no es de la API (el adaptador sirve estaticos, `/eventos`, fuentes y codigo);
 * un POST a una ruta de lectura no se atiende aqui (el adaptador decide el 405). Los cuerpos invalidos dan 400; los
 * rechazos, `estadoHttpDeRechazo`; los fallos de I/O del puerto se propagan (el adaptador responde 500).
 */
import { archivoDeRuta, COMANDOS_DE_INSPECT, estadoHttpDeRechazo, intencionSchema, peticionDeEdicionesSchema, peticionDeSaltoSchema, RUTAS_DE_DEV } from 'canonico';
import type { ComandoDeInspect, Intencion } from 'canonico';

import type { Consulta } from './consultas';
import type { EdicionesDeTexto, ResultadoDelWorkspaceVivo, WorkspaceVivo } from './workspace-vivo';

export interface PeticionDeDev {
  metodo: string;
  url: URL;
  /** JSON ya parseado (solo POST). */
  cuerpo?: unknown;
}

export interface RespuestaDeDev {
  status: number;
  cuerpo: unknown;
}

/** Rutas POST de la API: el adaptador lee su cuerpo JSON (y aplica sus controles de origen) antes de atender. */
export const RUTAS_POST_DE_DEV: readonly string[] = [RUTAS_DE_DEV.edit, RUTAS_DE_DEV.deshacer, RUTAS_DE_DEV.rehacer, RUTAS_DE_DEV.saltar, RUTAS_DE_DEV.confiar];

const json = (status: number, cuerpo: unknown): RespuestaDeDev => ({ status, cuerpo });

const resultado = (r: ResultadoDelWorkspaceVivo): RespuestaDeDev =>
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

async function post(vivo: WorkspaceVivo, ruta: string, cuerpo: unknown): Promise<RespuestaDeDev | undefined> {
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

async function get(vivo: WorkspaceVivo, url: URL): Promise<RespuestaDeDev | undefined> {
  const ruta = url.pathname;
  if (ruta === RUTAS_DE_DEV.estado) return json(200, vivo.estado());
  if (ruta === RUTAS_DE_DEV.archivos) return json(200, vivo.archivos());
  if (ruta.startsWith(RUTAS_DE_DEV.archivo)) {
    const file = archivoDeRuta(ruta.slice(RUTAS_DE_DEV.archivo.length));
    const leido = file === undefined ? undefined : vivo.archivo(file);
    return leido === undefined ? json(404, { ok: false, mensaje: 'Archivo inexistente' }) : json(200, leido);
  }
  if (ruta === RUTAS_DE_DEV.codigo) {
    const { componentes, confiado } = vivo.codigo();
    return json(200, { temaConCodigo: componentes.length > 0, componentes, confiado });
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
      return json(404, { error: 'Vista inexistente' });
    }
    // `?tema=<nombre>`: la Vista con otro Tema (previsualizar), sin cache ni Historial.
    const tema = url.searchParams.get('tema') ?? undefined;
    const geometria = await vivo.geometria(id, tema === undefined ? undefined : { tema });
    return geometria === undefined ? json(404, { error: tema === undefined ? `Vista '${id}' inexistente` : `Vista '${id}' o Tema '${tema}' inexistente` }) : json(200, geometria);
  }
  return undefined;
}

/** Atiende una ruta de la API; `undefined` si no lo es. */
export function atenderApiDeDev(vivo: WorkspaceVivo, { metodo, url, cuerpo }: PeticionDeDev): Promise<RespuestaDeDev | undefined> {
  return metodo === 'POST' ? post(vivo, url.pathname, cuerpo) : get(vivo, url);
}
