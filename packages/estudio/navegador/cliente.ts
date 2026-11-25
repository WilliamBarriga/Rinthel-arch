/**
 * Unica pieza del navegador que conoce las rutas del servidor de `dev`. Ningun metodo lanza: los fallos son datos.
 * Todo lo que recibe se valida con los esquemas del protocolo: un 2xx malformado es un fallo, un rechazo fuera del
 * protocolo da el estado y la ruta, y el bundle de Componentes exige un content-type de JavaScript.
 * Una Geometria que no llega en `plazoDeGeometriaMs` es un fallo: la pagina la calcula en el Worker.
 * SSE: una sola conexion a `/eventos` compartida por todos los oyentes (`escuchar`), abierta con el primero y cerrada
 * con el ultimo; los datos que no son JSON se descartan. El evento `estado` se valida como `GET /api/estado`: uno
 * malformado no llega a `suscribir` y se reporta a `alMalformado`.
 */
import { geometriaCacheadaSchema, salidaDeInspectSchema } from 'canonico';
import type { GeometriaCacheada, Intencion, MotivoDeRechazo, SalidaDeInspect } from 'canonico';

import {
  archivoDeDevSchema,
  archivosDeDevSchema,
  codigoDeDevSchema,
  confianzaDeDevSchema,
  errorDeDevSchema,
  escrituraDeDevSchema,
  estadoDeDevSchema,
  inspectNoEncontradoSchema,
  rechazoDeDevSchema,
  rutaDeArchivo,
  RUTAS_DE_DEV,
  rutaDeInspect,
} from '../src/protocolo';
import type { ArchivoDeDev, ArchivosDeDev, CodigoDeDev, ComandoDeInspect, EstadoDeDev, NombreDeEventoDeDev, PeticionDeEdiciones } from '../src/protocolo';

/**
 * `desactualizado` es el 409 (`stale-hash`; lo resuelve `escritura/escritura.ts`). `version` (si `dev` la da)
 * es la del estado tras la escritura; `motivo` y `file`, los del rechazo.
 */
export type ResultadoDeEnvio = { ok: true; version?: number } | { ok: false; desactualizado: boolean; message: string; reason?: MotivoDeRechazo; file?: string };

/** `error` solo si llego malformada. */
export type LecturaDeGeometria = { ok: true; geometria: GeometriaCacheada } | { ok: false; error?: string };

export interface DependenciasDelCliente {
  fetch: typeof fetch;
  /** Suscripcion SSE a `url` que entrega cada evento con su nombre (un `EventSource` en el navegador); devuelve como cerrarla. */
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Espera maxima en ms de una Geometria antes de darla por no llegada. */
  plazoDeGeometriaMs?: number;
}

/** Lo que el cliente necesita de un esquema de zod. */
interface Esquema<T> {
  safeParse(x: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> } };
}

/** Primer problema de un esquema, legible. */
function motivo(error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> }): string {
  const primero = error.issues[0];
  return `${primero?.path.map(String).join('.') ?? ''} ${primero?.message ?? ''}`.trim();
}

/** Pasado este plazo, el Worker la calcula antes de lo que tardaria en llegar. */
const PLAZO_DE_GEOMETRIA_MS = 4000;

/** `ok: false` lleva el mensaje de `inspect` y los ids cercanos (vacios si el fallo no es "no existe"). */
export type LecturaDeInspect = { ok: true; salida: SalidaDeInspect } | { ok: false; message: string; suggestions: string[] };

/** Lectura que puede fallar con un motivo visible (red, estado HTTP o respuesta malformada). */
export type Lectura<T> = { ok: true; valor: T } | { ok: false; message: string };

export interface ClienteDeDev {
  /** El estado vigente; `undefined` si no llega o llega roto. */
  estado(): Promise<EstadoDeDev | undefined>;
  /**
   * Recibe el vigente al conectar y uno por recompilacion, ya validados; uno malformado se descarta y va a
   * `alMalformado` con el motivo. Devuelve la baja.
   */
  suscribir(alEstado: (estado: EstadoDeDev) => void, alMalformado?: (message: string) => void): () => void;
  /** Oye un evento SSE por nombre con sus datos ya parseados (sin validar); devuelve la baja. */
  escuchar(nombre: NombreDeEventoDeDev, alDatos: (datos: unknown) => void): () => void;
  /** `GET /api/inspect/<comando>/<argumento>`; `opciones` van en la query (las de `tema`). */
  inspeccionar(comando: ComandoDeInspect, argumento: string, opciones?: Readonly<Record<string, string>>): Promise<LecturaDeInspect>;
  /** `version` es la del estado que vio la pagina; el servidor la traduce a `visto`. */
  editar(intencion: Intencion, version: number): Promise<ResultadoDeEnvio>;
  /** Ediciones de texto (`POST /api/edit { ediciones, version, descripcion?, aunqueNoCompile? }`): editor, `fix` y "Aplicar N fix". */
  editarTexto(peticion: PeticionDeEdiciones): Promise<ResultadoDeEnvio>;
  /** `GET /api/archivos`. */
  archivos(): Promise<Lectura<ArchivosDeDev>>;
  /** `GET /api/archivo/<ruta>`; `undefined` si no existe o falla. */
  archivo(file: string): Promise<ArchivoDeDev | undefined>;
  deshacer(): Promise<ResultadoDeEnvio>;
  rehacer(): Promise<ResultadoDeEnvio>;
  /** `POST /api/historial/saltar { id }` (0: Inicio). */
  saltar(id: number): Promise<ResultadoDeEnvio>;
  /** `GET /api/codigo`: si los Temas usan Componentes con codigo, cuales y si ya se confia. */
  codigo(): Promise<Lectura<CodigoDeDev>>;
  /** `POST /api/confiar`: desde aqui `dev` sirve el bundle de Componentes. */
  confiar(): Promise<ResultadoDeEnvio>;
  /** `GET /componentes.js`: el bundle CommonJS de los Componentes de Tema (403 hasta confiar). */
  bundleDeComponentes(): Promise<Lectura<string>>;
  /** Con `tema`, la Vista dibujada con ese Tema (`?tema=`, sin cache en el servidor): previsualizar sin escribir. */
  geometria(vista: string, opciones?: { tema?: string }): Promise<LecturaDeGeometria>;
}

export function crearClienteDeDev({ fetch: fetchFn, eventos, plazoDeGeometriaMs = PLAZO_DE_GEOMETRIA_MS }: DependenciasDelCliente): ClienteDeDev {
  /** El cuerpo de un 2xx contra su esquema; malformado es un fallo con el primer problema. */
  const validar = <T>(ruta: string, esquema: Esquema<T>, cuerpo: unknown): Lectura<T> => {
    const leido = esquema.safeParse(cuerpo);
    return leido.success ? { ok: true, valor: leido.data } : { ok: false, message: `Malformed response from ${ruta} (${motivo(leido.error)})` };
  };

  /** Mensaje de un no-2xx: el del protocolo si el cuerpo lo cumple; si no, el estado y la ruta. */
  const mensajeDeError = (status: number, ruta: string, cuerpo: unknown): string => {
    const leido = errorDeDevSchema.safeParse(cuerpo);
    return leido.success ? leido.data.message : `Error ${status} at ${ruta}`;
  };

  /** `GET` de JSON validado; red, estado HTTP o forma dan un fallo con motivo. */
  const leer = async <T>(ruta: string, esquema: Esquema<T>): Promise<Lectura<T>> => {
    try {
      const res = await fetchFn(ruta);
      const cuerpo: unknown = await res.json().catch(() => undefined);
      return res.ok ? validar(ruta, esquema, cuerpo) : { ok: false, message: mensajeDeError(res.status, ruta, cuerpo) };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  };

  const valorDe = <T>(lectura: Lectura<T>): T | undefined => (lectura.ok ? lectura.valor : undefined);

  /** `POST` de JSON: el 2xx contra `aceptada` y el rechazo contra `rechazoDeDevSchema`. */
  const post = async (ruta: string, cuerpo: unknown, aceptada: Esquema<{ ok: true; version?: number }> = escrituraDeDevSchema): Promise<ResultadoDeEnvio> => {
    try {
      const res = await fetchFn(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const leido: unknown = await res.json().catch(() => undefined);
      if (res.ok) {
        const r = validar(ruta, aceptada, leido);
        if (!r.ok) return { ok: false, desactualizado: false, message: r.message };
        return r.valor.version === undefined ? { ok: true } : { ok: true, version: r.valor.version };
      }
      const desactualizado = res.status === 409;
      const rechazo = rechazoDeDevSchema.safeParse(leido);
      if (!rechazo.success) return { ok: false, desactualizado, message: `Error ${res.status} at ${ruta}` };
      const { message: mensaje, reason: porque, file } = rechazo.data;
      return { ok: false, desactualizado, message: mensaje, ...(porque !== undefined && { reason: porque }), ...(file !== undefined && { file }) };
    } catch (error) {
      return { ok: false, desactualizado: false, message: (error as Error).message };
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
    cerrarConexion ??= eventos(RUTAS_DE_DEV.eventos, alEvento);
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
      const ruta = rutaDeInspect(comando, argumento, opciones);
      try {
        const res = await fetchFn(ruta);
        const cuerpo: unknown = await res.json().catch(() => undefined);
        if (res.ok) {
          const leida = validar(ruta, salidaDeInspectSchema, cuerpo);
          return leida.ok ? { ok: true, salida: leida.valor } : { ok: false, message: leida.message, suggestions: [] };
        }
        const rechazo = inspectNoEncontradoSchema.safeParse(cuerpo);
        return rechazo.success ? { ok: false, message: rechazo.data.message, suggestions: rechazo.data.suggestions } : { ok: false, message: `Error ${res.status}`, suggestions: [] };
      } catch (error) {
        return { ok: false, message: (error as Error).message, suggestions: [] };
      }
    },
    estado: async () => valorDe(await leer(RUTAS_DE_DEV.estado, estadoDeDevSchema)),
    suscribir: (alEstado, alMalformado) =>
      escuchar('estado', (datos) => {
        const leido = estadoDeDevSchema.safeParse(datos);
        if (leido.success) alEstado(leido.data);
        else alMalformado?.(`Malformed state event (${motivo(leido.error)})`);
      }),
    codigo: () => leer(RUTAS_DE_DEV.codigo, codigoDeDevSchema),
    confiar: () => post(RUTAS_DE_DEV.confiar, {}, confianzaDeDevSchema),
    async bundleDeComponentes() {
      const ruta = RUTAS_DE_DEV.componentes;
      try {
        const res = await fetchFn(ruta);
        if (!res.ok) return { ok: false, message: mensajeDeError(res.status, ruta, await res.json().catch(() => undefined)) };
        const tipo = res.headers.get('content-type') ?? '';
        return /javascript/i.test(tipo) ? { ok: true, valor: await res.text() } : { ok: false, message: `Malformed response from ${ruta} (content-type '${tipo}', expected JavaScript)` };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
    editar: (intencion, version) => post(RUTAS_DE_DEV.edit, { ...intencion, version }),
    editarTexto: (peticion) => post(RUTAS_DE_DEV.edit, peticion),
    archivos: () => leer(RUTAS_DE_DEV.archivos, archivosDeDevSchema),
    archivo: async (file) => valorDe(await leer(rutaDeArchivo(file), archivoDeDevSchema)),
    deshacer: () => post(RUTAS_DE_DEV.deshacer, {}),
    rehacer: () => post(RUTAS_DE_DEV.rehacer, {}),
    saltar: (id) => post(RUTAS_DE_DEV.saltar, { id }),
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
        const res = await fetchFn(`${RUTAS_DE_DEV.vista}${encodeURIComponent(vista)}${tema === undefined ? '' : `?tema=${encodeURIComponent(tema)}`}`, { signal: abortar.signal });
        return res.ok ? await res.json() : NO_LLEGO;
      })().catch(() => NO_LLEGO);
      const cruda = await Promise.race([pedida, vencida]);
      clearTimeout(plazo);
      if (cruda === NO_LLEGO) return { ok: false };
      const leida = geometriaCacheadaSchema.safeParse(cruda);
      if (leida.success) return { ok: true, geometria: leida.data };
      return { ok: false, error: `Malformed geometry in View ${vista}: ${motivo(leida.error)}`.trim() };
    },
  };
}
