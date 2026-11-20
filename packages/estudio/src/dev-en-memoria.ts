/**
 * `devEnMemoria`: el servidor de `dev` sin red, para probar la pagina en jsdom. La Sesion, los issues, las ediciones
 * con `visto` y el Historial son reales (`sesion` sobre `workspaceEnMemoria`); solo el transporte es falso: `fetch`
 * responde las rutas del protocolo y `eventos` empuja `event: estado`, `event: actividad` y `event: diferencia` como
 * `/eventos`. El origen de la Diferencia sale de quien escribe (`editarFuera` es externo; las rutas, propias), no del hash.
 * Invariantes: cumple `probarContratoDeDev` (la misma suite corre contra el `dev` real); una escritura (propia o
 * `editarFuera`) recompila y empuja un estado con `version` mayor; las versiones viejas se olvidan como en `dev`.
 * Errores: nunca lanza por una peticion; responde el estado HTTP que daria `dev`.
 */
import { combineIconProviders, crearLectorDeActividad, genericIcons, intencionSchema, serializarIconos, workspaceIcons } from 'canonico';
import type { EventoDeActividad, Issue, MotivoDeRechazo } from 'canonico';
import { abrirSesion, aplicarAlWorkspace, deshacerSobre, diferenciaVacia, diferenciar, hashDeContenido, historialVacio, registrar, rehacerSobre, workspaceEnMemoria } from 'sesion';
import type { Aplicable, Consulta, HistorialDeArchivos, ResultadoDeRestaurar, Sesion, WorkspaceEnMemoria } from 'sesion';

import { COMANDOS_DE_INSPECT, peticionDeEdicionesSchema } from './protocolo';
import type { ActividadDeDev, ArchivoDeDev, ArchivosDeDev, ComandoDeInspect, DiferenciaDeDev, EstadoDeDev, NombreDeEventoDeDev, OrigenDeDiferencia } from './protocolo';

type Archivos = Readonly<Record<string, string>>;

export interface DevEnMemoria {
  fetch: typeof fetch;
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Escritura ajena (agente u otro editor); `undefined` borra. Recompila y empuja el estado. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Anexa texto al Registro de actividad (como el CLI de otro proceso) y empuja los Eventos nuevos como `actividad`. */
  anexarActividad(texto: string): void;
  /** Espera a que termine la recompilacion en curso, si la hay. */
  asentado(): Promise<void>;
  /** El Workspace en memoria, para leer lo que quedo escrito. */
  workspace: WorkspaceEnMemoria;
  cerrar(): Promise<void>;
}

/** Igual que `EVENTOS_PREVIOS` de `dev`. */
const EVENTOS_PREVIOS = 50;
/** Igual que `VERSIONES_GUARDADAS` de `dev`. */
const VERSIONES_GUARDADAS = 16;
const RAIZ = '/memoria';

const HTTP_DE_RECHAZO = (motivo: MotivoDeRechazo): number => (motivo === 'hash-desactualizado' ? 409 : 422);

const hashesDe = (archivos: Archivos): Record<string, string> => Object.fromEntries(Object.entries(archivos).map(([ruta, texto]) => [ruta, hashDeContenido(texto)]));

/** Una Intencion (se describe por su tipo; las descripciones finas las arma `dev`) o ediciones de texto; `undefined` es 400. */
function leerPedidoDeEdicion(cuerpo: unknown): { aplicable: Aplicable; descripcion: string | undefined; aunqueNoCompile: boolean } | undefined {
  if (typeof cuerpo === 'object' && cuerpo !== null && 'ediciones' in cuerpo) {
    const texto = peticionDeEdicionesSchema.safeParse(cuerpo);
    return texto.success ? { aplicable: texto.data.ediciones, descripcion: texto.data.descripcion, aunqueNoCompile: texto.data.aunqueNoCompile === true } : undefined;
  }
  const intencion = intencionSchema.safeParse(cuerpo);
  return intencion.success ? { aplicable: intencion.data, descripcion: intencion.data.tipo, aunqueNoCompile: false } : undefined;
}

/** Quita las claves `undefined` (las opciones van con `exactOptionalPropertyTypes`). */
const dejarDefinidos = <T extends Record<string, string | undefined>>(o: T): { [K in keyof T]?: string } => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: string };

const respuesta = (status: number, cuerpo: unknown): Response => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

/** `actividad`: texto inicial de `.diagrams/actividad.jsonl`. */
export async function devEnMemoria({ propios, temas, actividad: registroInicial }: { propios: Archivos; temas?: Archivos; actividad?: string }): Promise<DevEnMemoria> {
  const workspace = workspaceEnMemoria({ propios, ...(temas !== undefined && { temas }) });
  let version = 0;
  let actual: Sesion = abrirSesion(workspace.leer().disco);
  let buena: { sesion: Sesion; archivos: Archivos } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos: workspace.leer().disco };
  let issues: Issue[] = await actual.diagnosticar();
  let cambio: EstadoDeDev['cambio'];
  const versiones = new Map<number, Record<string, string>>([[0, hashesDe(workspace.leer().disco)]]);
  let historial: HistorialDeArchivos = historialVacio;
  const oyentes = new Set<(nombre: NombreDeEventoDeDev, datos: string) => void>();
  const leerActividad = crearLectorDeActividad();
  let registro = registroInicial;
  let actividad: EventoDeActividad[] = leerActividad(registro).slice(-EVENTOS_PREVIOS);

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

  /** Origen de lo escrito desde la ultima Sesion buena (lo externo gana). */
  let origenPendiente: OrigenDeDiferencia | undefined;
  const recompilar = async (origen: OrigenDeDiferencia): Promise<void> => {
    origenPendiente = origenPendiente === 'externo' ? 'externo' : origen;
    const nuevos = workspace.leer().disco;
    const sesion = (buena?.sesion ?? actual).actualizar(nuevos);
    issues = await sesion.diagnosticar();
    actual = sesion;
    cambio = sesion.fuente === undefined ? undefined : 'estructura';
    let diferencia: DiferenciaDeDev | undefined;
    if (sesion.fuente !== undefined) {
      const cambios = buena?.sesion.fuente === undefined ? undefined : diferenciar(buena.sesion.fuente, sesion.fuente);
      if (cambios !== undefined && !diferenciaVacia(cambios)) diferencia = { version: version + 1, origen: origenPendiente, ...cambios };
      origenPendiente = undefined;
      buena = { sesion, archivos: nuevos };
    }
    version += 1;
    versiones.set(version, hashesDe(nuevos));
    versiones.delete(version - VERSIONES_GUARDADAS);
    emitir('estado', estado());
    if (diferencia !== undefined) emitir('diferencia', diferencia);
  };

  const ok = async (): Promise<Response> => {
    await recompilar('propio');
    return respuesta(200, { ok: true, version });
  };
  const rechazo = (motivo: MotivoDeRechazo, mensaje: string, file?: string): Response => respuesta(HTTP_DE_RECHAZO(motivo), { ok: false, motivo, mensaje, ...(file !== undefined && { file }) });

  const editar = (cuerpo: unknown): Promise<Response> =>
    enCola(async () => {
      const pedido = leerPedidoDeEdicion(cuerpo);
      if (pedido === undefined) return respuesta(400, { ok: false, mensaje: 'Se esperaba una Intencion { tipo, ... } o { ediciones, version, descripcion? }' });
      const versionVista = (cuerpo as { version?: unknown }).version;
      let visto: Record<string, string> | undefined;
      if (typeof versionVista === 'number') {
        visto = versiones.get(versionVista);
        if (visto === undefined) return rechazo('hash-desactualizado', `La version ${versionVista} del estado ya no esta guardada; recarga la Vista`);
      }
      const antes = workspace.leer().propios;
      const r = aplicarAlWorkspace(workspace, pedido.aplicable, visto, { aunqueNoCompile: pedido.aunqueNoCompile });
      if (!r.ok) return rechazo(r.motivo, r.mensaje, r.file);
      const descripcion = pedido.descripcion ?? `texto de ${r.cambiados.join(', ')}`;
      historial = registrar(historial, descripcion, antes, workspace.leer().propios);
      return ok();
    });

  const restaurar = (mover: (h: HistorialDeArchivos, disco: Archivos) => ResultadoDeRestaurar): Promise<Response> =>
    enCola(async () => {
      const disco = workspace.leer().propios;
      const r = mover(historial, disco);
      if (!r.ok) return rechazo(r.motivo, r.mensaje, r.file);
      for (const ruta of r.escritos) {
        const nuevo = r.archivos[ruta];
        if (nuevo === undefined) workspace.borrar(ruta);
        else workspace.escribir(ruta, nuevo);
      }
      historial = r.historial;
      return ok();
    });

  const listarArchivos = (): ArchivosDeDev => {
    const { disco, propios } = workspace.leer();
    return {
      version,
      archivos: Object.keys(disco)
        .sort()
        .map((file) => ({ file, hash: hashDeContenido(disco[file] as string), soloLectura: !(file in propios) })),
    };
  };
  const leerArchivo = (ruta: string): ArchivoDeDev | undefined => {
    const texto = workspace.leer().disco[ruta];
    return texto === undefined ? undefined : { file: ruta, texto, hash: hashDeContenido(texto), version };
  };

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
      if (ruta === '/api/deshacer') return restaurar(deshacerSobre);
      if (ruta === '/api/rehacer') return restaurar(rehacerSobre);
      if (ruta === '/api/confiar') return respuesta(200, { ok: true });
      return respuesta(404, { ok: false, mensaje: 'No encontrado' });
    }
    if (ruta === '/api/estado') return respuesta(200, estado());
    if (ruta === '/api/archivos') return respuesta(200, listarArchivos());
    if (ruta.startsWith('/api/archivo/')) {
      const leido = leerArchivo(ruta.slice('/api/archivo/'.length).split('/').map(decodeURIComponent).join('/'));
      return leido === undefined ? respuesta(404, { ok: false, mensaje: 'Archivo inexistente' }) : respuesta(200, leido);
    }
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
      // Como `dev`: al conectar llegan el estado vigente y los ultimos Eventos de actividad.
      queueMicrotask(() => {
        if (!oyentes.has(alEvento)) return;
        alEvento('estado', JSON.stringify(estado()));
        alEvento('actividad', JSON.stringify({ previos: true, eventos: actividad } satisfies ActividadDeDev));
      });
      return () => oyentes.delete(alEvento);
    },
    editarFuera(ruta, texto) {
      if (texto === undefined) workspace.borrar(ruta);
      else workspace.escribir(ruta, texto);
      pendiente = enCola(() => recompilar('externo'));
    },
    anexarActividad(texto) {
      registro = (registro ?? '') + texto;
      const nuevos = leerActividad(registro);
      if (nuevos.length === 0) return;
      actividad = [...actividad, ...nuevos].slice(-EVENTOS_PREVIOS);
      emitir('actividad', { previos: false, eventos: nuevos } satisfies ActividadDeDev);
    },
    asentado: () => pendiente.then(() => cola).then(() => undefined),
    workspace,
    async cerrar() {
      oyentes.clear();
      await cola;
    },
  };
}
