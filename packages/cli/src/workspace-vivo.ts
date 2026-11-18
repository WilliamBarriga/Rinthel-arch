/**
 * "Workspace vivo" (ADR 0005, ADR 0007): el estado vivo de `dev`, sin HTTP. Guarda la Sesion vigente, la
 * ultima Sesion buena, el Historial de deshacer/rehacer, la cola de escrituras, la version del estado con los
 * hashes por archivo de las ultimas `VERSIONES_GUARDADAS` versiones, la clasificacion del cambio y la confianza
 * en el codigo de Temas. El enrutador HTTP de `dev` es un adaptador fino encima.
 *
 * Interfaz: `abrirWorkspaceVivo(opciones) -> WorkspaceVivo` con `estado()`, `suscribir`, `editar(intencion, version?)`,
 * `deshacer()`, `rehacer()`, `geometria(vista)`, `recargar()`, `codigo()`, `confiar()` y `cerrar()`.
 * Adaptadores: el disco y el watcher entran por `PuertoDelWorkspaceVivo` (disco en `dev.ts`, memoria en
 * `puerto-en-memoria.ts`); el reloj del debounce por `Reloj`.
 *
 * Invariantes:
 * - Una edicion lleva la version del estado que vio quien la emite; se traduce a `visto` (archivo -> hash de esa
 *   version). Una version que ya no esta guardada se rechaza como `hash-desactualizado`. Sin version, se aplica
 *   sobre el texto vigente.
 * - Edicion, deshacer y rehacer se serializan en una cola; una escritura que falla a mitad se revierte.
 * - Las recompilaciones se agrupan con debounce y se serializan; si el Workspace tiene errores el estado lleva
 *   los issues pero conserva la Fuente y la Geometria de la ultima Sesion sin errores, y no trae `cambio`.
 * - Deshacer y rehacer restauran el texto exacto del Historial; si el disco cambio fuera (edicion externa)
 *   rechazan con `hash-desactualizado` y el Historial vuelve a empezar desde el disco.
 * Modos de error: rechazos como datos (`MotivoDeRechazo`); los fallos de I/O del puerto al escribir se propagan
 * (tras revertir); los de lectura al recompilar se ignoran hasta el siguiente cambio. `abrirWorkspaceVivo` lanza
 * si la lectura inicial falla.
 */
import { combineIconProviders, genericIcons, serializarIconos, workspaceIcons } from 'canonico';
import type { EstadoDeDev, GeometriaCacheada, Intencion, Issue, MotivoDeRechazo, TipoDeCambio } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';
import { abrirSesion, aplicarAlWorkspace, apilar, archivoDeVista, crearHistorial, deshacer as deshacerHistorial, hashDeContenido, rehacer as rehacerHistorial } from 'sesion';
import type { Historial, PuertoDeWorkspace, Sesion, Visto } from 'sesion';
import { componentesDeTema } from 'tema';

import { clasificarCambio } from './cambio';
import type { ResultadoDeCodigo } from './codigo';
import { esArchivoDeFuente } from './workspace';

/** Cuantas versiones del estado se recuerdan para traducir la version vista de una edicion a `visto`. */
export const VERSIONES_GUARDADAS = 16;

/**
 * Puerto del Workspace vivo: el de la puerta de escritura (`leer`, `escribir`) mas lo que necesita `dev`.
 * Dos adaptadores: disco (`dev.ts`) y memoria (`puerto-en-memoria.ts`).
 */
export interface PuertoDelWorkspaceVivo extends PuertoDeWorkspace {
  /** Borra un archivo propio del Workspace (deshacer/rehacer de una edicion que lo creo); uno ausente no es error. */
  borrar(ruta: string): void;
  /** Hash de cada recurso vigilado (`.tsx`, fuentes), o `undefined` si el adaptador no los conoce. */
  recursos(): Record<string, string> | undefined;
  /** Avisa de cualquier cambio en el Workspace; devuelve como dejar de observar. */
  observar(alCambiar: () => void): () => void;
}

/** Reloj del debounce: programa `fn` dentro de `ms` y devuelve como cancelarla. */
export interface Reloj {
  programar(fn: () => void, ms: number): () => void;
}

/** Reloj real: `setTimeout`. */
export const relojReal: Reloj = {
  programar(fn, ms) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface OpcionesDelWorkspaceVivo {
  puerto: PuertoDelWorkspaceVivo;
  /** Raiz absoluta del Workspace: solo para el `href` (`vscode://file/...`) de cada issue. */
  raiz: string;
  /** Por defecto `relojReal`. */
  reloj?: Reloj;
  /** Espera tras el ultimo cambio antes de recompilar (150 ms por defecto). */
  debounceMs?: number;
  /** Compila los `.tsx` del Workspace; por defecto no hay codigo. */
  compilarCodigo?: () => ResultadoDeCodigo;
  /** Codigo de Temas ya confirmado (`--trust-code`). */
  confiarEnCodigo?: boolean;
}

/** Resultado de una edicion, deshacer o rehacer: la version del estado tras recompilar, o el rechazo. */
export type ResultadoDelWorkspaceVivo = { ok: true; version: number } | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

/** Estado del codigo de Temas: componentes que usan los Temas de la ultima Fuente buena, confianza y bundle. */
export interface CodigoDelWorkspace {
  componentes: string[];
  confiado: boolean;
  bundle: string;
}

export interface WorkspaceVivo {
  /** Estado vigente con la forma de `estadoDeDevSchema` de `canonico`. */
  estado(): EstadoDeDev;
  /** Llama a `alCambiar` con cada estado nuevo (tras cada recompilacion); devuelve como dejar de escuchar. */
  suscribir(alCambiar: (estado: EstadoDeDev) => void): () => void;
  /** Aplica una Intencion por la puerta de `sesion`; `version` es la del estado que vio quien la emite. */
  editar(intencion: Intencion, version?: number): Promise<ResultadoDelWorkspaceVivo>;
  deshacer(): Promise<ResultadoDelWorkspaceVivo>;
  rehacer(): Promise<ResultadoDelWorkspaceVivo>;
  /** Geometria cacheada de una Vista de la ultima Sesion buena; `undefined` si no existe. */
  geometria(vista: string): Promise<GeometriaCacheada | undefined>;
  /** Relee el puerto y recompila ya (sin esperar al debounce). */
  recargar(): Promise<void>;
  codigo(): CodigoDelWorkspace;
  /** Confirma el codigo de Temas: a partir de aqui se sirve. */
  confiar(): void;
  /** Deja de observar y cancela el debounce pendiente. */
  cerrar(): void;
}

const SIN_CODIGO: ResultadoDeCodigo = { componentes: {}, issues: [], bundle: 'return {};' };

const mismoTexto = (a: ArchivosDelWorkspace, b: ArchivosDelWorkspace): boolean => {
  const claves = Object.keys(a);
  return claves.length === Object.keys(b).length && claves.every((k) => a[k] === b[k]);
};

const hashesDe = (archivos: ArchivosDelWorkspace): Record<string, string> => Object.fromEntries(Object.entries(archivos).map(([ruta, texto]) => [ruta, hashDeContenido(texto)]));

export async function abrirWorkspaceVivo(opciones: OpcionesDelWorkspaceVivo): Promise<WorkspaceVivo> {
  const { puerto, raiz, reloj = relojReal, debounceMs = 150, compilarCodigo = () => SIN_CODIGO } = opciones;

  const fuentesDe = (recursos: Record<string, string> | undefined): Record<string, string> | undefined =>
    recursos === undefined ? undefined : Object.fromEntries(Object.entries(recursos).filter(([ruta]) => esArchivoDeFuente(ruta)));
  const opcionesDeSesion = (recursos: Record<string, string> | undefined): { archivosDeFuente?: string[] } => {
    const fuentes = fuentesDe(recursos);
    return fuentes === undefined ? {} : { archivosDeFuente: Object.keys(fuentes) };
  };

  let version = 0;
  let archivos = puerto.leer().disco;
  /** Recursos (`.tsx`, fuentes) del ultimo instante bueno y tipo del ultimo cambio empujado. */
  let recursos = puerto.recursos();
  let cambio: TipoDeCambio | undefined;
  let codigo = compilarCodigo();
  let confiado = opciones.confiarEnCodigo ?? false;
  let actual: Sesion = abrirSesion(archivos, { ...opcionesDeSesion(recursos), componentes: codigo.componentes, issuesDelAdaptador: codigo.issues });
  /** Ultima Sesion sin errores de compilacion y los archivos con que se abrio. */
  let buena: { sesion: Sesion; archivos: ArchivosDelWorkspace } | undefined = actual.fuente === undefined ? undefined : { sesion: actual, archivos };
  let issues: Issue[] = await actual.diagnosticar();
  /** Hashes por archivo de las ultimas versiones del estado (version -> archivo -> hash). */
  const versiones = new Map<number, Record<string, string>>([[version, hashesDe(archivos)]]);
  let estado = construirEstado();

  const suscriptores = new Set<(estado: EstadoDeDev) => void>();
  /** Historial de deshacer/rehacer del texto propio del Workspace (ADR 0007); vive con el Workspace vivo. */
  let historial: Historial | undefined;

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
      archivosDeVista: Object.fromEntries(
        (fuente?.views ?? []).flatMap(({ id }) => {
          const archivo = buena === undefined ? undefined : archivoDeVista(buena.sesion, id);
          return archivo === undefined ? [] : [[id, archivo] as const];
        }),
      ),
      hashes: versiones.get(version) ?? hashesDe(archivos),
      ...(fuentes !== undefined && { fuentes }),
      issues: issues.map((issue) => ({ ...issue, href: `vscode://file/${raiz}/${issue.file}:${issue.line}:${issue.column}` })),
    };
  }

  // Recompilaciones serializadas: si llega un cambio durante una, se repite al terminar y quien espera, espera a las dos.
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
    codigo = compilarCodigo();
    const sesion = (buena?.sesion ?? actual).actualizar(nuevos, { ...opcionesDeSesion(nuevosRecursos), componentes: codigo.componentes, issuesDelAdaptador: codigo.issues });
    const nuevosIssues = await sesion.diagnosticar();
    actual = sesion;
    archivos = nuevos;
    // Con errores se conserva el ultimo dibujo bueno (y sus recursos de referencia): no hay cambio que dibujar.
    cambio = sesion.fuente === undefined ? undefined : clasificarCambio({ fuente: buena?.sesion.fuente, recursos: recursos ?? {} }, { fuente: sesion.fuente, recursos: nuevosRecursos ?? {} });
    if (sesion.fuente !== undefined) {
      buena = { sesion, archivos: nuevos };
      recursos = nuevosRecursos;
    }
    issues = nuevosIssues;
    version += 1;
    versiones.set(version, hashesDe(nuevos));
    versiones.delete(version - VERSIONES_GUARDADAS);
    estado = construirEstado();
    for (const suscriptor of suscriptores) suscriptor(estado);
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
  const dejarDeObservar = puerto.observar(() => {
    cancelarDebounce?.();
    cancelarDebounce = reloj.programar(() => {
      cancelarDebounce = undefined;
      void recompilar().catch(() => undefined);
    }, debounceMs);
  });

  /** Cola simple: edicion, deshacer y rehacer se ejecutan una tras otra. */
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  };

  /** Restaura, sin interrumpirse por nuevos fallos, las `rutas` al texto de `origen` (o las borra si no existian). */
  const revertir = (origen: ArchivosDelWorkspace, rutas: readonly string[]): void => {
    for (const ruta of rutas) {
      try {
        if (ruta in origen) puerto.escribir(ruta, origen[ruta] as string);
        else puerto.borrar(ruta);
      } catch {
        // mejor esfuerzo: si el disco sigue fallando, el siguiente deshacer/rehacer detecta la diferencia y reinicia el historial
      }
    }
  };
  /** Deja los archivos propios con el texto de `destino` (escribe lo distinto o nuevo, borra lo sobrante); si falla a mitad revierte y relanza. */
  const dejarEnDisco = (origen: ArchivosDelWorkspace, destino: ArchivosDelWorkspace): void => {
    const tocadas: string[] = [];
    try {
      for (const ruta of Object.keys(destino).filter((r) => destino[r] !== origen[r]).sort()) {
        tocadas.push(ruta);
        puerto.escribir(ruta, destino[ruta] as string);
      }
      for (const ruta of Object.keys(origen).filter((r) => !(r in destino)).sort()) {
        tocadas.push(ruta);
        puerto.borrar(ruta);
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

  const editar = (intencion: Intencion, versionVista?: number): Promise<ResultadoDelWorkspaceVivo> =>
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
              puerto.escribir(ruta, texto);
            },
          },
          intencion,
          traducido.visto,
        );
      } catch (error) {
        revertir(antes, escritas);
        throw error;
      }
      if (!resultado.ok) return { ok: false, motivo: resultado.motivo, mensaje: resultado.mensaje, ...(resultado.file !== undefined && { file: resultado.file }) };
      // Si el texto ya no es el del historial (se edito fuera de dev), el historial vuelve a empezar desde ahi.
      const despues = puerto.leer().propios;
      if (!mismoTexto(antes, despues)) {
        const base = historial !== undefined && mismoTexto(historial.archivos, antes) ? historial : crearHistorial(antes);
        historial = apilar(base, despues);
      }
      cancelarDebounce?.();
      cancelarDebounce = undefined;
      await recompilar();
      return { ok: true, version };
    });

  const restaurar = (mover: (h: Historial) => Historial | undefined, motivo: 'nada-que-deshacer' | 'nada-que-rehacer'): Promise<ResultadoDelWorkspaceVivo> =>
    enCola(async () => {
      const disco = puerto.leer().propios;
      historial ??= crearHistorial(disco);
      if (!mismoTexto(historial.archivos, disco)) {
        historial = crearHistorial(disco);
        return { ok: false, motivo: 'hash-desactualizado', mensaje: 'El Workspace cambio fuera de dev; no hay historial que restaurar' };
      }
      const siguiente = mover(historial);
      if (siguiente === undefined) return { ok: false, motivo, mensaje: motivo === 'nada-que-deshacer' ? 'Nada que deshacer' : 'Nada que rehacer' };
      dejarEnDisco(disco, siguiente.archivos);
      historial = siguiente;
      cancelarDebounce?.();
      cancelarDebounce = undefined;
      await recompilar();
      return { ok: true, version };
    });

  return {
    estado: () => estado,
    suscribir(alCambiar) {
      suscriptores.add(alCambiar);
      return () => suscriptores.delete(alCambiar);
    },
    editar,
    deshacer: () => restaurar(deshacerHistorial, 'nada-que-deshacer'),
    rehacer: () => restaurar(rehacerHistorial, 'nada-que-rehacer'),
    geometria: (vista) => buena?.sesion.geometria(vista) ?? Promise.resolve(undefined),
    recargar: () => recompilar(),
    codigo: () => ({ componentes: [...new Set((buena?.sesion.fuente?.themes ?? []).flatMap((tema) => componentesDeTema(tema)))].sort(), confiado, bundle: codigo.bundle }),
    confiar() {
      confiado = true;
    },
    cerrar() {
      cancelarDebounce?.();
      cancelarDebounce = undefined;
      dejarDeObservar();
    },
  };
}
