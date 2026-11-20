/**
 * `devEnMemoria`: el servidor de `dev` sin red, para probar la pagina en jsdom. La Sesion, los issues, las ediciones
 * con `visto` y el Historial son reales (`sesion` sobre `workspaceEnMemoria`); solo el transporte es falso: `fetch`
 * responde las rutas del protocolo y `eventos` empuja `event: estado` como `/eventos`.
 * Invariantes: cumple `probarContratoDeDev` (la misma suite corre contra el `dev` real); una escritura (propia o
 * `editarFuera`) recompila y empuja un estado con `version` mayor; las versiones viejas se olvidan como en `dev`.
 * Errores: nunca lanza por una peticion; responde el estado HTTP que daria `dev`.
 */
import { combineIconProviders, genericIcons, intencionSchema, serializarIconos, workspaceIcons } from 'canonico';
import type { Issue, MotivoDeRechazo } from 'canonico';
import { abrirSesion, aplicarAlWorkspace, apilar, crearHistorial, deshacer, hashDeContenido, rehacer, workspaceEnMemoria } from 'sesion';
import type { Consulta, Historial, Sesion, WorkspaceEnMemoria } from 'sesion';

import { COMANDOS_DE_INSPECT } from './protocolo';
import type { ComandoDeInspect, EstadoDeDev, NombreDeEventoDeDev } from './protocolo';

type Archivos = Readonly<Record<string, string>>;

export interface DevEnMemoria {
  fetch: typeof fetch;
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Escritura ajena (agente u otro editor); `undefined` borra. Recompila y empuja el estado. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Espera a que termine la recompilacion en curso, si la hay. */
  asentado(): Promise<void>;
  /** El Workspace en memoria, para leer lo que quedo escrito. */
  workspace: WorkspaceEnMemoria;
  cerrar(): Promise<void>;
}

/** Igual que `VERSIONES_GUARDADAS` de `dev`. */
const VERSIONES_GUARDADAS = 16;
const RAIZ = '/memoria';

const HTTP_DE_RECHAZO = (motivo: MotivoDeRechazo): number => (motivo === 'hash-desactualizado' ? 409 : 422);

const iguales = (a: Archivos, b: Archivos): boolean => {
  const claves = Object.keys(a);
  return claves.length === Object.keys(b).length && claves.every((k) => a[k] === b[k]);
};

const hashesDe = (archivos: Archivos): Record<string, string> => Object.fromEntries(Object.entries(archivos).map(([ruta, texto]) => [ruta, hashDeContenido(texto)]));

/** Quita las claves `undefined` (las opciones van con `exactOptionalPropertyTypes`). */
const dejarDefinidos = <T extends Record<string, string | undefined>>(o: T): { [K in keyof T]?: string } => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: string };

const respuesta = (status: number, cuerpo: unknown): Response => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

export async function devEnMemoria({ propios, temas }: { propios: Archivos; temas?: Archivos }): Promise<DevEnMemoria> {
  const workspace = workspaceEnMemoria({ propios, ...(temas !== undefined && { temas }) });
  let version = 0;
  let actual: Sesion = abrirSesion(workspace.leer().disco);
  let buena: { sesion: Sesion; archivos: Archivos } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos: workspace.leer().disco };
  let issues: Issue[] = await actual.diagnosticar();
  let cambio: EstadoDeDev['cambio'];
  const versiones = new Map<number, Record<string, string>>([[0, hashesDe(workspace.leer().disco)]]);
  let historial: Historial | undefined;
  const oyentes = new Set<(nombre: NombreDeEventoDeDev, datos: string) => void>();

  const estado = (): EstadoDeDev => {
    const fuente = buena?.sesion.fuente;
    return {
      version,
      ...(cambio !== undefined && { cambio }),
      ...(fuente !== undefined && { fuente }),
      iconos: buena === undefined ? {} : serializarIconos(combineIconProviders(workspaceIcons(buena.archivos), genericIcons())),
      vistas: fuente?.views.map(({ id }) => id) ?? [],
      issues: issues.map((issue) => ({ ...issue, href: `vscode://file${RAIZ}/${issue.file}:${issue.line}:${issue.column}` })),
    };
  };
  const emitir = (nombre: NombreDeEventoDeDev, datos: unknown): void => {
    const texto = JSON.stringify(datos);
    for (const oyente of [...oyentes]) oyente(nombre, texto);
  };

  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(tarea: () => Promise<T>): Promise<T> => {
    const r = cola.then(tarea, tarea);
    cola = r.catch(() => undefined);
    return r;
  };

  const recompilar = async (): Promise<void> => {
    const nuevos = workspace.leer().disco;
    const sesion = (buena?.sesion ?? actual).actualizar(nuevos);
    issues = await sesion.diagnosticar();
    actual = sesion;
    cambio = sesion.fuente === undefined ? undefined : 'estructura';
    if (sesion.fuente !== undefined) buena = { sesion, archivos: nuevos };
    version += 1;
    versiones.set(version, hashesDe(nuevos));
    versiones.delete(version - VERSIONES_GUARDADAS);
    emitir('estado', estado());
  };

  const ok = async (): Promise<Response> => {
    await recompilar();
    return respuesta(200, { ok: true, version });
  };
  const rechazo = (motivo: MotivoDeRechazo, mensaje: string, file?: string): Response => respuesta(HTTP_DE_RECHAZO(motivo), { ok: false, motivo, mensaje, ...(file !== undefined && { file }) });

  const editar = (cuerpo: unknown): Promise<Response> =>
    enCola(async () => {
      const intencion = intencionSchema.safeParse(cuerpo);
      if (!intencion.success) return respuesta(400, { ok: false, mensaje: 'Se esperaba una Intencion { tipo, ... }' });
      const versionVista = (cuerpo as { version?: unknown }).version;
      let visto: Record<string, string> | undefined;
      if (typeof versionVista === 'number') {
        visto = versiones.get(versionVista);
        if (visto === undefined) return rechazo('hash-desactualizado', `La version ${versionVista} del estado ya no esta guardada; recarga la Vista`);
      }
      const antes = workspace.leer().propios;
      const r = aplicarAlWorkspace(workspace, intencion.data, visto);
      if (!r.ok) return rechazo(r.motivo, r.mensaje, r.file);
      const despues = workspace.leer().propios;
      if (!iguales(antes, despues)) historial = apilar(historial !== undefined && iguales(historial.archivos, antes) ? historial : crearHistorial(antes), despues);
      return ok();
    });

  const restaurar = (mover: (h: Historial) => Historial | undefined, motivo: 'nada-que-deshacer' | 'nada-que-rehacer'): Promise<Response> =>
    enCola(async () => {
      const disco = workspace.leer().propios;
      historial ??= crearHistorial(disco);
      if (!iguales(historial.archivos, disco)) {
        historial = crearHistorial(disco);
        return rechazo('hash-desactualizado', 'El Workspace cambio fuera de dev; no hay historial que restaurar');
      }
      const siguiente = mover(historial);
      if (siguiente === undefined) return rechazo(motivo, motivo === 'nada-que-deshacer' ? 'Nada que deshacer' : 'Nada que rehacer');
      for (const [ruta, texto] of Object.entries(siguiente.archivos)) if (disco[ruta] !== texto) workspace.escribir(ruta, texto);
      for (const ruta of Object.keys(disco)) if (!(ruta in siguiente.archivos)) workspace.borrar(ruta);
      historial = siguiente;
      return ok();
    });

  const consultar = (url: URL): Response => {
    const [comando, codificado, ...sobra] = url.pathname.slice('/api/inspect/'.length).split('/');
    const argumento = codificado === undefined ? '' : decodeURIComponent(codificado);
    if (comando === undefined || !(COMANDOS_DE_INSPECT as readonly string[]).includes(comando) || argumento === '' || sobra.length > 0) {
      return respuesta(404, { ok: false, mensaje: `Ruta de inspect desconocida: ${url.pathname}`, cercanos: [] });
    }
    const opcion = (nombre: string) => url.searchParams.get(nombre) ?? undefined;
    const consulta: Consulta =
      comando === 'tema'
        ? { comando, argumento, ...dejarDefinidos({ tipo: opcion('tipo'), estado: opcion('estado'), diagrama: opcion('diagrama') }), catalogo: url.searchParams.get('catalogo') === 'true' }
        : { comando: comando as Exclude<ComandoDeInspect, 'tema'>, argumento };
    const r = buena?.sesion.consultar(consulta);
    if (r === undefined) return respuesta(422, { ok: false, mensaje: 'El Workspace tiene errores y nunca compilo; no hay nada que consultar', cercanos: [] });
    if ('noEncontrado' in r) return respuesta(404, { ok: false, mensaje: r.noEncontrado, cercanos: r.cercanos });
    return respuesta(200, r.salida);
  };

  const atender = async (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const metodo = init?.method ?? 'GET';
    const ruta = url.pathname;
    if (metodo === 'POST') {
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      } catch {
        return respuesta(400, { ok: false, mensaje: 'JSON invalido' });
      }
      if (ruta === '/api/edit') return editar(cuerpo);
      if (ruta === '/api/deshacer') return restaurar(deshacer, 'nada-que-deshacer');
      if (ruta === '/api/rehacer') return restaurar(rehacer, 'nada-que-rehacer');
      if (ruta === '/api/confiar') return respuesta(200, { ok: true });
      return respuesta(404, { ok: false, mensaje: 'No encontrado' });
    }
    if (ruta === '/api/estado') return respuesta(200, estado());
    if (ruta === '/api/codigo') return respuesta(200, { temaConCodigo: false, componentes: [], confiado: false });
    if (ruta.startsWith('/api/inspect/')) return consultar(url);
    if (ruta.startsWith('/api/vista/')) {
      const tema = url.searchParams.get('tema') ?? undefined;
      const geometria = await buena?.sesion.geometria(decodeURIComponent(ruta.slice('/api/vista/'.length)), tema === undefined ? undefined : { tema });
      return geometria === undefined ? respuesta(404, { error: 'Vista o Tema inexistente' }) : respuesta(200, geometria);
    }
    return new Response('No encontrado', { status: 404 });
  };

  let pendiente: Promise<unknown> = Promise.resolve();
  return {
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => atender(new URL(String(entrada instanceof Request ? entrada.url : entrada), 'http://memoria'), init)) as typeof fetch,
    eventos(url, alEvento) {
      if (url !== '/eventos') return () => undefined;
      oyentes.add(alEvento);
      // Como `dev`: al conectar llega el estado vigente.
      queueMicrotask(() => {
        if (oyentes.has(alEvento)) alEvento('estado', JSON.stringify(estado()));
      });
      return () => oyentes.delete(alEvento);
    },
    editarFuera(ruta, texto) {
      if (texto === undefined) workspace.borrar(ruta);
      else workspace.escribir(ruta, texto);
      pendiente = enCola(recompilar);
    },
    asentado: () => pendiente.then(() => cola).then(() => undefined),
    workspace,
    async cerrar() {
      oyentes.clear();
      await cola;
    },
  };
}
