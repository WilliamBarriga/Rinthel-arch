/**
 * Unica pieza del navegador que conoce las rutas del servidor de `dev`. Ningun metodo lanza: los fallos son datos.
 * Una Geometria que no llega en `plazoDeGeometriaMs` es un fallo: la pagina la calcula en el Worker.
 * SSE: una sola conexion a `/eventos` compartida por todos los oyentes (`escuchar`), abierta con el primero y cerrada
 * con el ultimo; los datos que no son JSON se descartan.
 */
import { geometriaCacheadaSchema } from 'canonico';
import type { GeometriaCacheada, Intencion, SalidaDeInspect } from 'canonico';

import { archivoDeDevSchema, archivosDeDevSchema, estadoDeDevSchema, inspectNoEncontradoSchema, rutaDeArchivo, rutaDeInspect } from '../src/protocolo';
import type { ArchivoDeDev, ArchivosDeDev, ComandoDeInspect, EstadoDeDev, NombreDeEventoDeDev, PeticionDeEdiciones } from '../src/protocolo';

/**
 * `desactualizado` es el 409 (`hash-desactualizado`): hay que recargar y avisar. `version` (si `dev` la da) es la del
 * estado tras la escritura; `motivo` y `file`, los del rechazo.
 */
export type ResultadoDeEnvio = { ok: true; version?: number } | { ok: false; desactualizado: boolean; mensaje: string; motivo?: string; file?: string };

/** Si el texto estaba desactualizado (409) avisa y recarga el estado; si no, avisa `fallo: mensaje`. */
export async function avisarRechazo(r: Extract<ResultadoDeEnvio, { ok: false }>, fallo: string, { avisar, recargar }: { avisar: (texto: string) => void; recargar: () => Promise<void> }): Promise<void> {
  avisar(r.desactualizado ? `El archivo cambio en disco; se recargo la Vista (${r.mensaje})` : `${fallo}: ${r.mensaje}`);
  if (r.desactualizado) await recargar().catch(() => undefined);
}

/** `error` solo si llego malformada. */
export type LecturaDeGeometria = { ok: true; geometria: GeometriaCacheada } | { ok: false; error?: string };

export interface DependenciasDelCliente {
  fetch: typeof fetch;
  /** Suscripcion SSE a `url` que entrega cada evento con su nombre (un `EventSource` en el navegador); devuelve como cerrarla. */
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Espera maxima en ms de una Geometria antes de darla por no llegada. */
  plazoDeGeometriaMs?: number;
}

/** Pasado este plazo, el Worker la calcula antes de lo que tardaria en llegar. */
const PLAZO_DE_GEOMETRIA_MS = 4000;

/** `ok: false` lleva el mensaje de `inspect` y los ids cercanos (vacios si el fallo no es "no existe"). */
export type LecturaDeInspect = { ok: true; salida: SalidaDeInspect } | { ok: false; mensaje: string; cercanos: string[] };

export interface ClienteDeDev {
  /** El estado vigente; `undefined` si no llega o llega roto. */
  estado(): Promise<EstadoDeDev | undefined>;
  /** Recibe el vigente al conectar y uno por recompilacion; devuelve la baja. */
  suscribir(alEstado: (estado: EstadoDeDev) => void): () => void;
  /** Oye un evento SSE por nombre con sus datos ya parseados (sin validar); devuelve la baja. */
  escuchar(nombre: NombreDeEventoDeDev, alDatos: (datos: unknown) => void): () => void;
  /** `GET /api/inspect/<comando>/<argumento>`; `opciones` van en la query (las de `tema`). */
  inspeccionar(comando: ComandoDeInspect, argumento: string, opciones?: Readonly<Record<string, string>>): Promise<LecturaDeInspect>;
  /** `version` es la del estado que vio la pagina; el servidor la traduce a `visto`. */
  editar(intencion: Intencion, version: number): Promise<ResultadoDeEnvio>;
  /** Ediciones de texto (`POST /api/edit { ediciones, version, descripcion?, aunqueNoCompile? }`): editor, `fix` y "Aplicar N fix". */
  editarTexto(peticion: PeticionDeEdiciones): Promise<ResultadoDeEnvio>;
  /** `GET /api/archivos`; `undefined` si falla. */
  archivos(): Promise<ArchivosDeDev | undefined>;
  /** `GET /api/archivo/<ruta>`; `undefined` si no existe o falla. */
  archivo(file: string): Promise<ArchivoDeDev | undefined>;
  deshacer(): Promise<ResultadoDeEnvio>;
  rehacer(): Promise<ResultadoDeEnvio>;
  /** Con `tema`, la Vista dibujada con ese Tema (`?tema=`, sin cache en el servidor): previsualizar sin escribir. */
  geometria(vista: string, opciones?: { tema?: string }): Promise<LecturaDeGeometria>;
}

export function crearClienteDeDev({ fetch: fetchFn, eventos, plazoDeGeometriaMs = PLAZO_DE_GEOMETRIA_MS }: DependenciasDelCliente): ClienteDeDev {
  const post = async (ruta: string, cuerpo: unknown): Promise<ResultadoDeEnvio> => {
    try {
      const res = await fetchFn(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const leido = (await res.json().catch(() => ({}))) as { ok?: boolean; mensaje?: string; version?: unknown; motivo?: unknown; file?: unknown };
      if (res.ok && leido.ok === true) return typeof leido.version === 'number' ? { ok: true, version: leido.version } : { ok: true };
      return {
        ok: false,
        desactualizado: res.status === 409,
        mensaje: leido.mensaje ?? `Error ${res.status}`,
        ...(typeof leido.motivo === 'string' && { motivo: leido.motivo }),
        ...(typeof leido.file === 'string' && { file: leido.file }),
      };
    } catch (error) {
      return { ok: false, desactualizado: false, mensaje: (error as Error).message };
    }
  };

  const leerJson = async <T>(ruta: string, esquema: { safeParse(x: unknown): { success: true; data: T } | { success: false } }): Promise<T | undefined> => {
    try {
      const res = await fetchFn(ruta);
      if (!res.ok) return undefined;
      const leido = esquema.safeParse(await res.json());
      return leido.success ? leido.data : undefined;
    } catch {
      return undefined;
    }
  };

  const oyentes = new Map<string, Set<(datos: unknown) => void>>();
  let cerrarConexion: (() => void) | undefined;
  const alEvento = (nombre: string, datos: string): void => {
    const delNombre = oyentes.get(nombre);
    if (delNombre === undefined || delNombre.size === 0) return;
    let leido: unknown;
    try {
      leido = JSON.parse(datos);
    } catch {
      return;
    }
    for (const oyente of [...delNombre]) oyente(leido);
  };
  const escuchar = (nombre: NombreDeEventoDeDev, alDatos: (datos: unknown) => void): (() => void) => {
    const delNombre = oyentes.get(nombre) ?? new Set();
    oyentes.set(nombre, delNombre);
    delNombre.add(alDatos);
    cerrarConexion ??= eventos('/eventos', alEvento);
    return () => {
      delNombre.delete(alDatos);
      if ([...oyentes.values()].every((o) => o.size === 0)) {
        cerrarConexion?.();
        cerrarConexion = undefined;
      }
    };
  };

  return {
    escuchar,
    async inspeccionar(comando, argumento, opciones = {}) {
      try {
        const res = await fetchFn(rutaDeInspect(comando, argumento, opciones));
        const cuerpo = (await res.json().catch(() => undefined)) as unknown;
        if (res.ok) return { ok: true, salida: cuerpo as SalidaDeInspect };
        const rechazo = inspectNoEncontradoSchema.safeParse(cuerpo);
        return rechazo.success ? { ok: false, mensaje: rechazo.data.mensaje, cercanos: rechazo.data.cercanos } : { ok: false, mensaje: `Error ${res.status}`, cercanos: [] };
      } catch (error) {
        return { ok: false, mensaje: (error as Error).message, cercanos: [] };
      }
    },
    async estado() {
      try {
        const res = await fetchFn('/api/estado');
        if (!res.ok) return undefined;
        const leido = estadoDeDevSchema.safeParse(await res.json());
        return leido.success ? leido.data : undefined;
      } catch {
        return undefined;
      }
    },
    suscribir: (alEstado) => escuchar('estado', (datos) => alEstado(datos as EstadoDeDev)),
    editar: (intencion, version) => post('/api/edit', { ...intencion, version }),
    editarTexto: (peticion) => post('/api/edit', peticion),
    archivos: () => leerJson('/api/archivos', archivosDeDevSchema),
    archivo: (file) => leerJson(rutaDeArchivo(file), archivoDeDevSchema),
    deshacer: () => post('/api/deshacer', {}),
    rehacer: () => post('/api/rehacer', {}),
    async geometria(vista, { tema } = {}) {
      const NO_LLEGO = Symbol('no-llego');
      const abortar = new AbortController();
      let plazo: ReturnType<typeof setTimeout> | undefined;
      const vencida = new Promise<typeof NO_LLEGO>((resolver) => {
        plazo = setTimeout(() => {
          abortar.abort();
          resolver(NO_LLEGO);
        }, plazoDeGeometriaMs);
      });
      const pedida = (async (): Promise<unknown> => {
        const res = await fetchFn(`/api/vista/${encodeURIComponent(vista)}${tema === undefined ? '' : `?tema=${encodeURIComponent(tema)}`}`, { signal: abortar.signal });
        return res.ok ? await res.json() : NO_LLEGO;
      })().catch(() => NO_LLEGO);
      const cruda = await Promise.race([pedida, vencida]);
      clearTimeout(plazo);
      if (cruda === NO_LLEGO) return { ok: false };
      const leida = geometriaCacheadaSchema.safeParse(cruda);
      if (leida.success) return { ok: true, geometria: leida.data };
      const primero = leida.error.issues[0];
      return { ok: false, error: `Geometria malformada en la Vista ${vista}: ${primero?.path.join('.') ?? ''} ${primero?.message ?? ''}`.trim() };
    },
  };
}
