/**
 * Cliente unico de la pagina de `diagrams dev` (ADR 0005, ADR 0007): la unica pieza del navegador que conoce las
 * rutas del servidor. Envia una Intencion con la version del estado vista (`POST /api/edit`), deshace y rehace
 * (`POST /api/deshacer`, `/api/rehacer`), se suscribe al estado (`/eventos`, SSE), lo pide (`/api/estado`) y pide
 * la Geometria de una Vista (`/api/vista/<id>`), validada con el esquema de `canonico`.
 * El `fetch` y la fuente de eventos entran como argumento. Ningun metodo lanza: los fallos son datos.
 * No es parte de la interfaz del paquete: lo empaqueta `dev-shell.ts`.
 */
import { geometriaCacheadaSchema } from 'canonico';
import type { EstadoDeDev, GeometriaCacheada, Intencion } from 'canonico';

/** Resultado de una escritura: `desactualizado` es el 409 (`hash-desactualizado`): hay que recargar y avisar. */
export type ResultadoDeEnvio = { ok: true } | { ok: false; desactualizado: boolean; mensaje: string };

/** Geometria pedida: la valida, o un fallo; `error` solo si llego malformada (si no llego, no hay nada que mostrar). */
export type LecturaDeGeometria = { ok: true; geometria: GeometriaCacheada } | { ok: false; error?: string };

export interface DependenciasDelCliente {
  fetch: typeof fetch;
  /** Abre la suscripcion SSE a `url` (un `EventSource` en el navegador) y devuelve como cerrarla. */
  eventos: (url: string, alMensaje: (datos: string) => void) => () => void;
}

export interface ClienteDeDev {
  estado(): Promise<EstadoDeDev>;
  /** Llama a `alEstado` con cada estado empujado (el vigente al conectar y uno por recompilacion); devuelve la baja. */
  suscribir(alEstado: (estado: EstadoDeDev) => void): () => void;
  /** `version` es la del estado que vio la pagina; el servidor la traduce a `visto`. */
  editar(intencion: Intencion, version: number): Promise<ResultadoDeEnvio>;
  deshacer(): Promise<ResultadoDeEnvio>;
  rehacer(): Promise<ResultadoDeEnvio>;
  geometria(vista: string): Promise<LecturaDeGeometria>;
}

export function crearClienteDeDev({ fetch: fetchFn, eventos }: DependenciasDelCliente): ClienteDeDev {
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
    estado: async () => (await (await fetchFn('/api/estado')).json()) as EstadoDeDev,
    suscribir: (alEstado) => eventos('/eventos', (datos) => alEstado(JSON.parse(datos) as EstadoDeDev)),
    editar: (intencion, version) => post('/api/edit', { ...intencion, version }),
    deshacer: () => post('/api/deshacer', {}),
    rehacer: () => post('/api/rehacer', {}),
    async geometria(vista) {
      let cruda: unknown;
      try {
        const res = await fetchFn(`/api/vista/${encodeURIComponent(vista)}`);
        if (!res.ok) return { ok: false };
        cruda = await res.json();
      } catch {
        return { ok: false };
      }
      const leida = geometriaCacheadaSchema.safeParse(cruda);
      if (leida.success) return { ok: true, geometria: leida.data };
      const primero = leida.error.issues[0];
      return { ok: false, error: `Geometria malformada en la Vista ${vista}: ${primero?.path.join('.') ?? ''} ${primero?.message ?? ''}`.trim() };
    },
  };
}
