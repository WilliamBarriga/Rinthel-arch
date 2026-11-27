/**
 * `devEnMemoria`: el servidor de `dev` sin red, para probar la pagina en jsdom. Es el Workspace vivo real de `session`
 * (Sesion, issues, ediciones con `visto`, Historial, Diferencia con origen por hash, Registro de actividad) sobre
 * `inMemoryPort`, con las rutas de `handleDevApi`, las mismas que sirve `dev`; solo el transporte es falso: `fetch`
 * llama a la API y `eventos` serializa la instantanea de conexion y el flujo de eventos del Workspace vivo como `/eventos`.
 * Invariantes: cumple `probarContratoDeDev` (la misma suite corre contra el `dev` real); una escritura (propia o
 * `editarFuera`) recompila y empuja un estado con `version` mayor; las versiones viejas se olvidan como en `dev`.
 * Sin watcher ni debounce: `editarFuera` recompila en el acto y el Registro de actividad avisa sin espera.
 * Errores: nunca lanza por una peticion; responde el estado HTTP que daria `dev`.
 */
import { DEV_ROUTES } from 'canonical';
import { openLiveWorkspace, fetchOverDevApi, inMemoryPort } from 'session';
import type { Clock, InMemoryWorkspace } from 'session';

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
  workspace: InMemoryWorkspace;
  cerrar(): Promise<void>;
}

/** Temas con codigo ya compilados: `componentes`, los nombres exportados; `bundle`, el cuerpo CommonJS `(require) => exports` que compila `cli`. */
export interface CodigoDePrueba {
  componentes: readonly string[];
  bundle: string;
}

/**
 * Lo que necesita un `dev` de prueba (el de memoria o el real): el contenido de `inMemoryPort` (`propios`, `temas`
 * de `--theme-path`, `actividad` inicial y `escrituraRota`, toda escritura lanza con ese mensaje) y `codigo`, Temas con
 * codigo ya compilados (lo que daria el compilador de `.tsx` del adaptador; sin el, no hay codigo).
 */
export type ContenidoDeDevDePrueba = Pick<Parameters<typeof inMemoryPort>[0], 'own' | 'themes' | 'activity' | 'brokenWrite'> & { codigo?: CodigoDePrueba };

const RAIZ = '/memoria';

/** Sin debounce: el aviso del registro se atiende en el acto. */
const relojInmediato: Clock = {
  schedule(fn) {
    fn();
    return () => undefined;
  },
};

/** `ahora`: hora en ms de cada entrada del Historial de archivos; `codigo` se sirve en `/componentes.js` tras `POST /api/confiar`. */
export async function devEnMemoria({ codigo, ahora = Date.now, ...contenido }: ContenidoDeDevDePrueba & { ahora?: () => number }): Promise<DevEnMemoria> {
  const puerto = inMemoryPort(contenido);
  // Sin watcher: las escrituras propias recompilan al terminar y `editarFuera` pide la recompilacion.
  const vivo = await openLiveWorkspace({
    port: { ...puerto, watch: () => () => undefined },
    root: RAIZ,
    clock: relojInmediato,
    now: ahora,
    ...(codigo !== undefined && { compileCode: () => ({ components: Object.fromEntries(codigo.componentes.map((nombre) => [nombre, {}])), issues: [], bundle: codigo.bundle }) }),
  });

  const oyentes = new Set<(nombre: string, datos: string) => void>();
  const dejarDeEscuchar = vivo.listen(({ name: nombre, data: datos }) => {
    const texto = JSON.stringify(datos);
    for (const oyente of [...oyentes]) oyente(nombre, texto);
  });

  let enCurso: Promise<unknown> = Promise.resolve();
  const seguir = <T>(p: Promise<T>): Promise<T> => {
    enCurso = Promise.all([enCurso, p.catch(() => undefined)]);
    return p;
  };

  const atender = fetchOverDevApi(vivo, 'http://memoria');

  return {
    fetch: ((entrada: string | URL | Request, init?: RequestInit) => {
      const p = atender(entrada, init);
      // Solo las escrituras: una lectura (Geometria) puede esperar a temporizadores falsos de la prueba.
      return init?.method === 'POST' ? seguir(p) : p;
    }) as typeof fetch,
    eventos(url, alEvento) {
      if (url !== DEV_ROUTES.events) return () => undefined;
      oyentes.add(alEvento);
      queueMicrotask(() => {
        if (!oyentes.has(alEvento)) return;
        for (const { name: nombre, data: datos } of vivo.connection()) alEvento(nombre, JSON.stringify(datos));
      });
      return () => oyentes.delete(alEvento);
    },
    editarFuera(ruta, texto) {
      puerto.editOutside(ruta, texto);
      void seguir(vivo.reload());
    },
    editarTemaFuera(ruta, texto) {
      puerto.editThemeOutside(ruta, texto);
      void seguir(vivo.reload());
    },
    anexarActividad: (texto) => puerto.appendActivity(texto),
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
      dejarDeEscuchar();
      await enCurso;
      vivo.close();
    },
  };
}
