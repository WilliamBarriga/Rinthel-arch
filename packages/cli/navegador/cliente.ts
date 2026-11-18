/**
 * Cliente unico de la pagina de `diagrams dev` (ADR 0005, ADR 0007): la unica pieza del navegador que conoce las
 * rutas del servidor. Envia una Intencion con la version del estado vista (`POST /api/edit`), deshace y rehace
 * (`POST /api/deshacer`, `/api/rehacer`), se suscribe al estado (`/eventos`, SSE), lo pide (`/api/estado`) y pide
 * la Geometria de una Vista (`/api/vista/<id>`), validada con el esquema de `canonico`.
 * El `fetch` y la fuente de eventos entran como argumento. Ningun metodo lanza: los fallos son datos. Una Geometria
 * que no llega en `plazoDeGeometriaMs` es un fallo: la pagina la calcula en el Worker.
 * No es parte de la interfaz del paquete: lo empaqueta `dev-shell.ts`.
 */
import { estadoDeDevSchema, geometriaCacheadaSchema } from 'canonico';
import type { EstadoDeDev, GeometriaCacheada, Intencion } from 'canonico';

/** Resultado de una escritura: `desactualizado` es el 409 (`hash-desactualizado`): hay que recargar y avisar. */
export type ResultadoDeEnvio = { ok: true } | { ok: false; desactualizado: boolean; mensaje: string };

/** Geometria pedida: la valida, o un fallo; `error` solo si llego malformada (si no llego, no hay nada que mostrar). */
export type LecturaDeGeometria = { ok: true; geometria: GeometriaCacheada } | { ok: false; error?: string };

export interface DependenciasDelCliente {
  fetch: typeof fetch;
  /** Abre la suscripcion SSE a `url` (un `EventSource` en el navegador) y devuelve como cerrarla. */
  eventos: (url: string, alMensaje: (datos: string) => void) => () => void;
  /** Espera maxima de una Geometria antes de darla por no llegada (ms). */
  plazoDeGeometriaMs?: number;
}

/** Plazo por defecto de una Geometria: pasado este, el Worker la calcula antes de lo que tardaria en llegar. */
const PLAZO_DE_GEOMETRIA_MS = 4000;

export interface ClienteDeDev {
  /** El estado vigente; `undefined` si no llega o llega roto. */
  estado(): Promise<EstadoDeDev | undefined>;
  /** Llama a `alEstado` con cada estado empujado (el vigente al conectar y uno por recompilacion); devuelve la baja. */
  suscribir(alEstado: (estado: EstadoDeDev) => void): () => void;
  /** `version` es la del estado que vio la pagina; el servidor la traduce a `visto`. */
  editar(intencion: Intencion, version: number): Promise<ResultadoDeEnvio>;
  deshacer(): Promise<ResultadoDeEnvio>;
  rehacer(): Promise<ResultadoDeEnvio>;
  geometria(vista: string): Promise<LecturaDeGeometria>;
}

export function crearClienteDeDev({ fetch: fetchFn, eventos, plazoDeGeometriaMs = PLAZO_DE_GEOMETRIA_MS }: DependenciasDelCliente): ClienteDeDev {
  const post = async (ruta: string, cuerpo: unknown): Promise<ResultadoDeEnvio> => {
    try {
      const res = await fetchFn(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const leido = (await res.json().catch(() => ({}))) as { ok?: boolean; mensaje?: string };
      if (res.ok && leido.ok === true) return { ok: true };
      return { ok: false, desactualizado: res.status === 409, mensaje: leido.mensaje ?? `Error ${res.status}` };
    } catch (error) {
      return { ok: false, desactualizado: false, mensaje: (error as Error).message };
    }
  };

  return {
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
    suscribir: (alEstado) => eventos('/eventos', (datos) => alEstado(JSON.parse(datos) as EstadoDeDev)),
    editar: (intencion, version) => post('/api/edit', { ...intencion, version }),
    deshacer: () => post('/api/deshacer', {}),
    rehacer: () => post('/api/rehacer', {}),
    async geometria(vista) {
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
        const res = await fetchFn(`/api/vista/${encodeURIComponent(vista)}`, { signal: abortar.signal });
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
