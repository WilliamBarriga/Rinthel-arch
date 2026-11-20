/**
 * `devEnMemoria`: el servidor de `dev` sin red, para probar la pagina en jsdom. Es el Workspace vivo real de `sesion`
 * (Sesion, issues, ediciones con `visto`, Historial, Diferencia con origen por hash, Registro de actividad) sobre
 * `puertoEnMemoria`, con las rutas de `atenderApiDeDev`, las mismas que sirve `dev`; solo el transporte es falso: `fetch`
 * llama a la API y `eventos` empuja `event: estado`, `historial`, `actividad` y `diferencia` como `/eventos`.
 * Invariantes: cumple `probarContratoDeDev` (la misma suite corre contra el `dev` real); una escritura (propia o
 * `editarFuera`) recompila y empuja un estado con `version` mayor; las versiones viejas se olvidan como en `dev`.
 * Sin watcher ni debounce: `editarFuera` recompila en el acto y el Registro de actividad avisa sin espera.
 * Errores: nunca lanza por una peticion; responde el estado HTTP que daria `dev`.
 */
import { RUTAS_DE_DEV } from 'canonico';
import { abrirWorkspaceVivo, atenderApiDeDev, puertoEnMemoria, RUTAS_POST_DE_DEV } from 'sesion';
import type { Reloj, WorkspaceEnMemoria } from 'sesion';

import type { ActividadDeDev, NombreDeEventoDeDev } from './protocolo';

type Archivos = Readonly<Record<string, string>>;

export interface DevEnMemoria {
  fetch: typeof fetch;
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Escritura ajena (agente u otro editor); `undefined` borra. Recompila y empuja el estado. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Escritura ajena a un archivo de `--theme-path`; `undefined` lo borra. Recompila y empuja el estado. */
  editarTemaFuera(ruta: string, texto: string | undefined): void;
  /** Anexa texto al Registro de actividad (como el CLI de otro proceso) y empuja los Eventos nuevos como `actividad`. */
  anexarActividad(texto: string): void;
  /** Espera a que terminen las escrituras (POST, `editarFuera`) y sus recompilaciones. */
  asentado(): Promise<void>;
  /** El Workspace en memoria, para leer lo que quedo escrito. */
  workspace: WorkspaceEnMemoria;
  cerrar(): Promise<void>;
}

const RAIZ = '/memoria';

/** Sin debounce: el aviso del registro se atiende en el acto. */
const relojInmediato: Reloj = {
  programar(fn) {
    fn();
    return () => undefined;
  },
};

const respuesta = (status: number, cuerpo: unknown): Response => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

/** `actividad`: texto inicial de `.diagrams/actividad.jsonl`; `ahora`: hora en ms de cada entrada del Historial. */
export async function devEnMemoria({ propios, temas, actividad, ahora = Date.now }: { propios: Archivos; temas?: Archivos; actividad?: string; ahora?: () => number }): Promise<DevEnMemoria> {
  const puerto = puertoEnMemoria({ propios, ...(temas !== undefined && { temas }), ...(actividad !== undefined && { actividad }) });
  // Sin watcher: las escrituras propias recompilan al terminar y `editarFuera` pide la recompilacion.
  const vivo = await abrirWorkspaceVivo({ puerto: { ...puerto, observar: () => () => undefined }, raiz: RAIZ, reloj: relojInmediato, ahora });

  const oyentes = new Set<(nombre: NombreDeEventoDeDev, datos: string) => void>();
  const emitir = (nombre: NombreDeEventoDeDev, datos: unknown): void => {
    const texto = JSON.stringify(datos);
    for (const oyente of [...oyentes]) oyente(nombre, texto);
  };
  const dejar = [
    vivo.suscribir((estado) => {
      emitir('estado', estado);
      emitir('historial', vivo.historial());
    }),
    vivo.suscribirDiferencia((diferencia) => emitir('diferencia', diferencia)),
    vivo.suscribirActividad((eventos) => emitir('actividad', { previos: false, eventos } satisfies ActividadDeDev)),
  ];

  let enCurso: Promise<unknown> = Promise.resolve();
  const seguir = <T>(p: Promise<T>): Promise<T> => {
    enCurso = Promise.all([enCurso, p.catch(() => undefined)]);
    return p;
  };

  const atender = async (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const metodo = init?.method ?? 'GET';
    let cuerpo: unknown;
    if (RUTAS_POST_DE_DEV.includes(url.pathname)) {
      if (metodo !== 'POST') return respuesta(405, { ok: false, mensaje: 'Metodo no permitido' });
      try {
        cuerpo = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      } catch {
        return respuesta(400, { ok: false, mensaje: 'JSON invalido' });
      }
    }
    try {
      const r = await atenderApiDeDev(vivo, { metodo, url, cuerpo });
      return r === undefined ? new Response('No encontrado', { status: 404 }) : respuesta(r.status, r.cuerpo);
    } catch (error) {
      return respuesta(500, { ok: false, mensaje: (error as Error).message });
    }
  };

  return {
    fetch: ((entrada: string | URL | Request, init?: RequestInit) => {
      const p = atender(new URL(String(entrada instanceof Request ? entrada.url : entrada), 'http://memoria'), init);
      // Solo las escrituras: una lectura (Geometria) puede esperar a temporizadores falsos de la prueba.
      return init?.method === 'POST' ? seguir(p) : p;
    }) as typeof fetch,
    eventos(url, alEvento) {
      if (url !== RUTAS_DE_DEV.eventos) return () => undefined;
      oyentes.add(alEvento);
      // Como `dev`: al conectar llegan el estado vigente, el Historial y los ultimos Eventos de actividad.
      queueMicrotask(() => {
        if (!oyentes.has(alEvento)) return;
        alEvento('estado', JSON.stringify(vivo.estado()));
        alEvento('historial', JSON.stringify(vivo.historial()));
        alEvento('actividad', JSON.stringify({ previos: true, eventos: [...vivo.actividad()] } satisfies ActividadDeDev));
      });
      return () => oyentes.delete(alEvento);
    },
    editarFuera(ruta, texto) {
      puerto.editarFuera(ruta, texto);
      void seguir(vivo.recargar());
    },
    editarTemaFuera(ruta, texto) {
      puerto.editarTemaFuera(ruta, texto);
      void seguir(vivo.recargar());
    },
    anexarActividad: (texto) => puerto.anexarActividad(texto),
    asentado: async () => {
      let visto: Promise<unknown> | undefined;
      while (visto !== enCurso) {
        visto = enCurso;
        await visto;
      }
    },
    workspace: puerto,
    async cerrar() {
      oyentes.clear();
      for (const d of dejar) d();
      await enCurso;
      vivo.cerrar();
    },
  };
}
