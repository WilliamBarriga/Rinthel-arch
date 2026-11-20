/**
 * Workspace vivo: el estado de `dev` sin HTTP (Sesion vigente y ultima buena, Historial, cola de escrituras, versiones).
 * Eventos: es el unico dueno de la secuencia de eventos SSE del protocolo (`EventoDeDev` de `canonico`): `conexion()` da
 * lo que recibe un cliente al conectar (estado, Historial y actividad con previos) y `escuchar` el flujo (tras cada
 * estado, su Historial y su Diferencia; la actividad nueva). Los adaptadores (servidor real, `devEnMemoria`) solo serializan.
 * Invariantes: una edicion con `version` usa los hashes de esa version como `visto`; una version fuera de las ultimas
 * `VERSIONES_GUARDADAS` rechaza con `hash-desactualizado`; sin version, se aplica sobre el texto vigente.
 * Edicion, deshacer y rehacer van en cola; una escritura que falla a mitad se revierte. Con errores, el estado lleva los
 * issues con la Fuente y la Geometria de la ultima Sesion buena, sin `cambio`. El Historial es por archivo
 * (`HistorialDeArchivos`): una escritura externa no lo reinicia; deshacer y rehacer rechazan con `hash-desactualizado`
 * solo si cambio por fuera un archivo que la entrada restaura. Las ediciones de texto (editor, `fix`) usan la misma
 * puerta que las Intenciones; con `aunqueNoCompile` se escriben aunque introduzcan errores. Saltar (#193) escribe una
 * sola vez la instantanea destino, sin apilar, con la misma regla de rechazo; `historial()` dice que entradas son
 * alcanzables sobre el disco vigente. Toda escritura propia (edicion, deshacer, rehacer, saltar, revertir) pasa por
 * `escribirPropio`/`borrarPropio`, el punto unico que marca el origen `propio` de la Diferencia.
 * Errores: rechazos como datos; los fallos de I/O al escribir se propagan tras revertir; los de lectura al recompilar
 * se ignoran hasta el siguiente cambio; `abrirWorkspaceVivo` lanza si la lectura inicial falla.
 * Diferencia: cada Sesion sin errores se compara con la ultima buena y, si cambio algo, se emite tras el estado. Es
 * `propia` si todos los archivos que cambiaron coinciden por hash con lo que escribio la UI (Intencion, deshacer,
 * rehacer, saltar y lo que se revierte); si no, `externa`. Con Sesiones con errores entre medias, la Diferencia es una sola
 * y es externa si alguna escritura intermedia lo fue.
 * Registro de actividad: si el puerto lo da, se leen los ultimos `EVENTOS_PREVIOS` al abrir y cada aviso de su observador
 * (con debounce) emite los Eventos nuevos; un fallo de lectura o una linea rota se ignoran.
 */
import { combineIconProviders, crearLectorDeActividad, diferenciaVacia, esArchivoDeFuente, genericIcons, salidaDeInspectSchema, serializarIconos, workspaceIcons } from 'canonico';
import type { ArchivoDeDev, ArchivosDeDev, DiferenciaDeDev, EstadoDeDev, EventoDeActividad, EventoDeDev, GeometriaCacheada, HistorialDeDev, Intencion, Issue, MotivoDeRechazo, OrigenDeDiferencia, TipoDeCambio } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { componentesDeTema } from 'tema';

import { aplicarAlWorkspace } from './aplicar';
import type { EdicionDeTexto, PuertoDeWorkspace } from './aplicar';
import { clasificarCambio } from './cambio';
import type { Consulta, Respuesta } from './consultas';
import { diferenciar } from './diferencia';
import { hashDeContenido } from './ediciones';
import { descripcionDeIntencion, descripcionDeTexto, deshacerSobre, historialVacio, historialVisible, registrar, rehacerSobre, saltar } from './historial-de-archivos';
import type { HistorialDeArchivos, ResultadoDeRestaurar } from './historial-de-archivos';
import type { Visto } from './intenciones';
import { abrirSesion } from './sesion';
import type { InterfazDeComponente, OpcionesDeGeometria, Sesion } from './sesion';

/** Versiones del estado que se recuerdan para traducir la version vista a `visto`. */
export const VERSIONES_GUARDADAS = 16;

export interface PuertoDelWorkspaceVivo extends PuertoDeWorkspace {
  /** Un archivo ausente no es error. */
  borrar(ruta: string): void;
  /** Hash de cada recurso vigilado (`.tsx`, fuentes), o `undefined` si el adaptador no los conoce. */
  recursos(): Record<string, string> | undefined;
  /** Devuelve como dejar de observar. */
  observar(alCambiar: () => void): () => void;
  /** Registro de actividad (`.diagrams/actividad.jsonl`) con su observador propio; sin el, no hay actividad. */
  actividad?: RegistroDeActividad;
}

/** El watcher del Workspace ignora carpetas ocultas: el registro se observa aparte. */
export interface RegistroDeActividad {
  /** Texto entero del registro, o `undefined` si no existe. */
  leer(): string | undefined;
  /** Devuelve como dejar de observar. */
  observar(alCambiar: () => void): () => void;
}

/** Eventos de actividad que `dev` reproduce al conectar. */
export const EVENTOS_PREVIOS = 50;

/** `programar` devuelve como cancelar. */
export interface Reloj {
  programar(fn: () => void, ms: number): () => void;
}

export interface OpcionesDelWorkspaceVivo {
  puerto: PuertoDelWorkspaceVivo;
  /** Raiz absoluta del Workspace: solo para el `href` (`vscode://file/...`) de cada issue. */
  raiz: string;
  /** Debounce del observador y del Registro de actividad (el nucleo no tiene reloj propio). */
  reloj: Reloj;
  /** Espera en ms tras el ultimo cambio antes de recompilar; por defecto `DEBOUNCE_MS`. */
  debounceMs?: number;
  /** Por defecto no hay codigo. */
  compilarCodigo?: () => CodigoCompilado;
  confiarEnCodigo?: boolean;
  /** Hora en ms de cada entrada del Historial. */
  ahora: () => number;
}

/** Lo que da el compilador de Temas con codigo del adaptador (`cli`: esbuild sobre los `.tsx`). */
export interface CodigoCompilado {
  componentes: Readonly<Record<string, InterfazDeComponente>>;
  issues: readonly Issue[];
  bundle: string;
}

/** `version` es la del estado tras recompilar. */
export type ResultadoDelWorkspaceVivo = { ok: true; version: number } | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

/** Ediciones de texto de la UI (`POST /api/edit { ediciones }`): guardado del editor, un `fix` o "Aplicar N fix". */
export interface EdicionesDeTexto {
  ediciones: readonly EdicionDeTexto[];
  /** Descripcion de la entrada del Historial; por defecto "texto de <archivos>". */
  descripcion?: string;
  /** Guardado del editor: se escribe aunque introduzca errores (ADR 0007). Sin el, un error nuevo rechaza con `invalida`. */
  aunqueNoCompile?: boolean;
}

/** `componentes` son los que usan los Temas de la ultima Fuente buena. */
export interface CodigoDelWorkspace {
  componentes: string[];
  confiado: boolean;
  bundle: string;
}

export interface WorkspaceVivo {
  estado(): EstadoDeDev;
  /**
   * Flujo de eventos con nombre del protocolo, en orden: tras cada recompilacion, `estado` y su `historial` y, si la
   * Fuente cambio, la `diferencia` de esa `version`; por cada tanda anexada al Registro de actividad (con debounce),
   * `actividad` con `previos: false`. Devuelve como dejar de escuchar.
   */
  escuchar(alEvento: (evento: EventoDeDev) => void): () => void;
  /** `version` es la del estado que vio quien emite la Intencion o las ediciones. */
  editar(aplicable: Intencion | EdicionesDeTexto, version?: number): Promise<ResultadoDelWorkspaceVivo>;
  /** Historial de deshacer, lo mas viejo primero, con lo alcanzable sobre el disco vigente. */
  historial(): HistorialDeDev;
  /** Lee el puerto en el momento: lo que el editor puede abrir. */
  archivos(): ArchivosDeDev;
  /** `undefined` si el archivo no existe. */
  archivo(ruta: string): ArchivoDeDev | undefined;
  deshacer(): Promise<ResultadoDelWorkspaceVivo>;
  rehacer(): Promise<ResultadoDelWorkspaceVivo>;
  /** Lleva el Workspace a la entrada `id` (0: Inicio) sin apilar; `entrada-desconocida` si no existe. */
  saltar(id: number): Promise<ResultadoDelWorkspaceVivo>;
  /** Geometria de una Vista de la ultima Sesion buena (con `tema`, con ese Tema y sin cache); `undefined` si falta la Vista o el Tema. */
  geometria(vista: string, opciones?: OpcionesDeGeometria): Promise<GeometriaCacheada | undefined>;
  /** `inspect` sobre la ultima Sesion buena, con la salida normalizada como `inspect --json`; `undefined` si el Workspace nunca compilo. */
  consultar(consulta: Consulta): Respuesta | undefined;
  /**
   * Instantanea de conexion: lo que recibe un cliente de `/eventos` al conectar, en orden: `estado`, `historial` y
   * `actividad` con `previos: true` y los ultimos `EVENTOS_PREVIOS` Eventos leidos.
   */
  conexion(): EventoDeDev[];
  /** Relee el puerto y recompila ya (sin esperar al debounce). */
  recargar(): Promise<void>;
  codigo(): CodigoDelWorkspace;
  /** A partir de aqui se sirve el codigo de Temas. */
  confiar(): void;
  /** Deja de observar y cancela el debounce pendiente. */
  cerrar(): void;
}

export const DEBOUNCE_MS = 150;

/** Marca de un archivo que la UI borro (no es un hash posible). */
const BORRADO = '<borrado>';

/** Lo externo gana: una sola escritura ajena hace externa la Diferencia. */
const unirOrigen = (a: OrigenDeDiferencia | undefined, b: OrigenDeDiferencia | undefined): OrigenDeDiferencia | undefined => (a === 'externo' || b === 'externo' ? 'externo' : (a ?? b));

const SIN_CODIGO: CodigoCompilado = { componentes: {}, issues: [], bundle: 'return {};' };

const esEdicionesDeTexto = (aplicable: Intencion | EdicionesDeTexto): aplicable is EdicionesDeTexto => 'ediciones' in aplicable;

const hashesDe = (archivos: ArchivosDelWorkspace): Record<string, string> => Object.fromEntries(Object.entries(archivos).map(([ruta, texto]) => [ruta, hashDeContenido(texto)]));

export async function abrirWorkspaceVivo(opciones: OpcionesDelWorkspaceVivo): Promise<WorkspaceVivo> {
  const { puerto, raiz, reloj, debounceMs = DEBOUNCE_MS, compilarCodigo = () => SIN_CODIGO, ahora } = opciones;

  const fuentesDe = (recursos: Record<string, string> | undefined): Record<string, string> | undefined =>
    recursos === undefined ? undefined : Object.fromEntries(Object.entries(recursos).filter(([ruta]) => esArchivoDeFuente(ruta)));
  const opcionesDeSesion = (recursos: Record<string, string> | undefined): { archivosDeFuente?: string[] } => {
    const fuentes = fuentesDe(recursos);
    return fuentes === undefined ? {} : { archivosDeFuente: Object.keys(fuentes) };
  };

  let version = 0;
  let archivos = puerto.leer().disco;
  /** Recursos (`.tsx`, fuentes) de la ultima Sesion buena. */
  let recursos = puerto.recursos();
  let cambio: TipoDeCambio | undefined;
  let codigo = compilarCodigo();
  let confiado = opciones.confiarEnCodigo ?? false;
  let actual: Sesion = abrirSesion(archivos, { ...opcionesDeSesion(recursos), componentes: codigo.componentes, issuesDelAdaptador: codigo.issues });
  /** Ultima Sesion sin errores de compilacion. */
  let buena: { sesion: Sesion; archivos: ArchivosDelWorkspace } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos };
  let issues: Issue[] = await actual.diagnosticar();
  /** version -> archivo -> hash. */
  const versiones = new Map<number, Record<string, string>>([[version, hashesDe(archivos)]]);
  let estado = construirEstado();

  const oyentes = new Set<(evento: EventoDeDev) => void>();
  const emitir = (evento: EventoDeDev): void => {
    for (const oyente of [...oyentes]) oyente(evento);
  };
  let historial: HistorialDeArchivos = historialVacio;
  /** El alcance se calcula sobre el disco del momento. */
  const historialDeDev = (): HistorialDeDev => historialVisible(historial, puerto.leer().propios);
  /** Ruta -> hash de lo que escribio la UI (`BORRADO` si lo borro) y aun no vio una recompilacion: asi se reconoce su eco. */
  const escritosPropios = new Map<string, string>();
  /** Origen de lo cambiado desde la ultima Sesion buena; `undefined` si no cambio ningun archivo. */
  let origenPendiente: OrigenDeDiferencia | undefined;

  function construirEstado(): EstadoDeDev {
    const fuente = buena?.sesion.fuente;
    const proveedor = buena === undefined ? undefined : combineIconProviders(workspaceIcons(buena.archivos), genericIcons());
    const fuentes = fuentesDe(recursos);
    return {
      version,
      ...(cambio !== undefined && { cambio }),
      fuente,
      iconos: proveedor === undefined ? {} : serializarIconos(proveedor),
      vistas: fuente?.views.map(({ id }) => id) ?? [],
      ...(fuentes !== undefined && { fuentes }),
      issues: issues.map((issue) => ({ ...issue, href: `vscode://file/${raiz}/${issue.file}:${issue.line}:${issue.column}` })),
    };
  }

  // Si llega un cambio durante una recompilacion, se repite al terminar y quien espera, espera a las dos.
  let enCurso: Promise<void> | undefined;
  let pendiente = false;
  const recompilarUnaVez = async (): Promise<void> => {
    let nuevos: ArchivosDelWorkspace;
    let nuevosRecursos: Record<string, string> | undefined;
    try {
      nuevos = puerto.leer().disco;
      nuevosRecursos = puerto.recursos();
    } catch {
      return; // lectura a medias (archivo en reescritura): el siguiente evento reintenta
    }
    origenPendiente = unirOrigen(origenPendiente, origenDe(archivos, nuevos));
    codigo = compilarCodigo();
    const sesion = (buena?.sesion ?? actual).actualizar(nuevos, { ...opcionesDeSesion(nuevosRecursos), componentes: codigo.componentes, issuesDelAdaptador: codigo.issues });
    const nuevosIssues = await sesion.diagnosticar();
    actual = sesion;
    archivos = nuevos;
    // Con errores se conserva el ultimo dibujo bueno (y sus recursos de referencia): no hay cambio que dibujar.
    cambio = sesion.fuente === undefined ? undefined : clasificarCambio({ fuente: buena?.sesion.fuente, recursos: recursos ?? {} }, { fuente: sesion.fuente, recursos: nuevosRecursos ?? {} });
    let diferencia: DiferenciaDeDev | undefined;
    if (sesion.fuente !== undefined) {
      const cambios = buena?.sesion.fuente === undefined ? undefined : diferenciar(buena.sesion.fuente, sesion.fuente);
      // Un cambio sin archivos tocados (recursos) no tiene autor conocido: externo.
      if (cambios !== undefined && !diferenciaVacia(cambios)) diferencia = { version: version + 1, origen: origenPendiente ?? 'externo', ...cambios };
      origenPendiente = undefined;
      buena = { sesion, archivos: nuevos };
      recursos = nuevosRecursos;
    }
    issues = nuevosIssues;
    version += 1;
    versiones.set(version, hashesDe(nuevos));
    versiones.delete(version - VERSIONES_GUARDADAS);
    estado = construirEstado();
    // Toda escritura (propia o externa) recompila: el Historial y su alcance viajan con cada estado.
    emitir({ nombre: 'estado', datos: estado });
    emitir({ nombre: 'historial', datos: historialDeDev() });
    if (diferencia !== undefined) emitir({ nombre: 'diferencia', datos: diferencia });
  };
  /** `propio` si cada archivo que cambio es un eco por hash de una escritura de la UI (y lo consume). */
  function origenDe(previos: ArchivosDelWorkspace, nuevos: ArchivosDelWorkspace): OrigenDeDiferencia | undefined {
    const cambiados = [...new Set([...Object.keys(previos), ...Object.keys(nuevos)])].filter((ruta) => previos[ruta] !== nuevos[ruta]);
    if (cambiados.length === 0) return undefined;
    let origen: OrigenDeDiferencia = 'propio';
    for (const ruta of cambiados) {
      const texto = nuevos[ruta];
      if (escritosPropios.get(ruta) === (texto === undefined ? BORRADO : hashDeContenido(texto))) escritosPropios.delete(ruta);
      else origen = 'externo';
    }
    // Una escritura propia que no cambio el texto no deja eco: se olvida para no confundir una escritura ajena futura.
    for (const [ruta, hash] of escritosPropios) {
      const texto = nuevos[ruta];
      if ((texto === undefined ? BORRADO : hashDeContenido(texto)) === hash) escritosPropios.delete(ruta);
    }
    return origen;
  }
  /** Punto unico de escritura propia de `dev` (la UI: edicion, deshacer, rehacer, saltar, revertir); lo demas es externo. */
  const escribirPropio = (ruta: string, texto: string): void => {
    escritosPropios.set(ruta, hashDeContenido(texto));
    puerto.escribir(ruta, texto);
  };
  const borrarPropio = (ruta: string): void => {
    escritosPropios.set(ruta, BORRADO);
    puerto.borrar(ruta);
  };
  const recompilar = (): Promise<void> => {
    if (enCurso !== undefined) {
      pendiente = true;
      return enCurso;
    }
    enCurso = (async () => {
      try {
        do {
          pendiente = false;
          await recompilarUnaVez();
        } while (pendiente);
      } finally {
        enCurso = undefined;
      }
    })();
    return enCurso;
  };

  let cancelarDebounce: (() => void) | undefined;
  const cancelarPendiente = (): void => {
    cancelarDebounce?.();
    cancelarDebounce = undefined;
  };
  /** No espera al debounce que dispara la propia escritura. */
  const recompilarTrasEscribir = async (): Promise<ResultadoDelWorkspaceVivo> => {
    cancelarPendiente();
    await recompilar();
    return { ok: true, version };
  };
  const dejarDeObservar = puerto.observar(() => {
    cancelarPendiente();
    cancelarDebounce = reloj.programar(() => {
      cancelarDebounce = undefined;
      void recompilar().catch(() => undefined);
    }, debounceMs);
  });

  // Registro de actividad: lectura incremental tolerante (lineas rotas, archivo acortado o rotado), con su propio debounce.
  const leerActividad = crearLectorDeActividad();
  const leerRegistro = (): EventoDeActividad[] => {
    try {
      return leerActividad(puerto.actividad?.leer());
    } catch {
      return []; // el siguiente aviso reintenta
    }
  };
  let actividad = leerRegistro().slice(-EVENTOS_PREVIOS);
  let cancelarActividad: (() => void) | undefined;
  const dejarDeObservarActividad =
    puerto.actividad?.observar(() => {
      cancelarActividad?.();
      cancelarActividad = reloj.programar(() => {
        cancelarActividad = undefined;
        const nuevos = leerRegistro();
        if (nuevos.length === 0) return;
        actividad = [...actividad, ...nuevos].slice(-EVENTOS_PREVIOS);
        emitir({ nombre: 'actividad', datos: { previos: false, eventos: nuevos } });
      }, debounceMs);
    }) ?? (() => undefined);

  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  };

  /** Mejor esfuerzo: un fallo no interrumpe el resto de `rutas`. */
  const revertir = (origen: ArchivosDelWorkspace, rutas: readonly string[]): void => {
    for (const ruta of rutas) {
      try {
        if (ruta in origen) escribirPropio(ruta, origen[ruta] as string);
        else borrarPropio(ruta);
      } catch {
        // si el disco sigue fallando, el siguiente deshacer/rehacer detecta la diferencia y reinicia el historial
      }
    }
  };
  /** Si falla a mitad, revierte y relanza. */
  const dejarEnDisco = (origen: ArchivosDelWorkspace, destino: ArchivosDelWorkspace): void => {
    const tocadas: string[] = [];
    try {
      for (const ruta of Object.keys(destino).filter((r) => destino[r] !== origen[r]).sort()) {
        tocadas.push(ruta);
        escribirPropio(ruta, destino[ruta] as string);
      }
      for (const ruta of Object.keys(origen).filter((r) => !(r in destino)).sort()) {
        tocadas.push(ruta);
        borrarPropio(ruta);
      }
    } catch (error) {
      revertir(origen, tocadas);
      throw error;
    }
  };

  const vistoDe = (versionVista: number | undefined): { visto?: Visto } | undefined => {
    if (versionVista === undefined) return {};
    const hashes = versiones.get(versionVista);
    return hashes === undefined ? undefined : { visto: hashes };
  };

  const editar = (aplicable: Intencion | EdicionesDeTexto, versionVista?: number): Promise<ResultadoDelWorkspaceVivo> =>
    enCola(async () => {
      const traducido = vistoDe(versionVista);
      if (traducido === undefined) {
        return { ok: false, motivo: 'hash-desactualizado', mensaje: `La version ${versionVista} del estado ya no esta guardada; recarga la Vista` };
      }
      const antes = puerto.leer().propios;
      const escritas: string[] = [];
      let resultado;
      try {
        resultado = aplicarAlWorkspace(
          {
            leer: () => puerto.leer(),
            escribir: (ruta, texto) => {
              escritas.push(ruta);
              escribirPropio(ruta, texto);
            },
          },
          esEdicionesDeTexto(aplicable) ? aplicable.ediciones : aplicable,
          traducido.visto,
          { aunqueNoCompile: esEdicionesDeTexto(aplicable) && aplicable.aunqueNoCompile === true },
        );
      } catch (error) {
        revertir(antes, escritas);
        throw error;
      }
      if (!resultado.ok) return { ok: false, motivo: resultado.motivo, mensaje: resultado.mensaje, ...(resultado.file !== undefined && { file: resultado.file }) };
      const descripcion = !esEdicionesDeTexto(aplicable) ? descripcionDeIntencion(aplicable) : (aplicable.descripcion ?? descripcionDeTexto(resultado.cambiados));
      historial = registrar(historial, descripcion, antes, puerto.leer().propios, ahora());
      return recompilarTrasEscribir();
    });

  const restaurar = (mover: (h: HistorialDeArchivos, disco: ArchivosDelWorkspace) => ResultadoDeRestaurar): Promise<ResultadoDelWorkspaceVivo> =>
    enCola(async () => {
      const disco = puerto.leer().propios;
      const r = mover(historial, disco);
      if (!r.ok) return r;
      dejarEnDisco(disco, r.archivos);
      historial = r.historial;
      return recompilarTrasEscribir();
    });

  const listarArchivos = (): ArchivosDeDev => {
    const { disco, propios } = puerto.leer();
    return {
      version,
      archivos: Object.keys(disco)
        .sort()
        .map((file) => ({ file, hash: hashDeContenido(disco[file] as string), soloLectura: !(file in propios) })),
    };
  };

  return {
    estado: () => estado,
    escuchar(alEvento) {
      oyentes.add(alEvento);
      return () => void oyentes.delete(alEvento);
    },
    editar,
    deshacer: () => restaurar(deshacerSobre),
    rehacer: () => restaurar(rehacerSobre),
    saltar: (id) => restaurar((h, disco) => saltar(h, disco, id)),
    historial: historialDeDev,
    archivos: listarArchivos,
    archivo(ruta) {
      const texto = puerto.leer().disco[ruta];
      return texto === undefined ? undefined : { file: ruta, texto, hash: hashDeContenido(texto), version };
    },
    geometria: (vista, opciones) => buena?.sesion.geometria(vista, opciones) ?? Promise.resolve(undefined),
    consultar(consulta) {
      const r = buena?.sesion.consultar(consulta);
      return r === undefined || 'noEncontrado' in r ? r : { salida: salidaDeInspectSchema.parse(r.salida) };
    },
    conexion: () => [
      { nombre: 'estado', datos: estado },
      { nombre: 'historial', datos: historialDeDev() },
      { nombre: 'actividad', datos: { previos: true, eventos: [...actividad] } },
    ],
    recargar: () => recompilar(),
    codigo: () => ({ componentes: [...new Set((buena?.sesion.fuente?.themes ?? []).flatMap((tema) => componentesDeTema(tema)))].sort(), confiado, bundle: codigo.bundle }),
    confiar() {
      confiado = true;
    },
    cerrar() {
      cancelarPendiente();
      dejarDeObservar();
      cancelarActividad?.();
      dejarDeObservarActividad();
    },
  };
}
