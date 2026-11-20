/**
 * Actividad del agente en la pagina: funciones puras sobre un Evento de actividad (marca, resumen y destino de "seguir
 * al agente") y el almacen del feed, uno por cliente de `dev`.
 * Invariantes: el almacen oye `event: actividad` desde que se crea (los `previos` del arranque no cuentan como nuevos ni
 * mueven nada); solo los Eventos en vivo suben el contador (si no se sigue al agente) y llegan a `alEnVivo`.
 * Seams para la Diferencia (#196): `alEnVivo` (cada tanda nueva) y `siguiendo` (el interruptor).
 */
import type { EventoDeActividad, FuenteCanonica, ObjetivoDeActividad } from 'canonico';

import { actividadDeDevSchema } from '../../src/protocolo';
import { almacenPorCliente, crearValor, escucharValidado, useObservable } from '../almacen';
import type { ClienteQueEscucha, Observable } from '../almacen';
import { destinoDeNodo, vistaMuestra } from '../vistas/destino';

export type TipoDeMarca = 'ok' | 'errores' | 'avisos' | 'fallo';

const plural = (n: number, singular: string, varios: string): string => `${n} ${n === 1 ? singular : varios}`;

/** `fallo` es la salida 2 (fallo de uso); `errores`, la salida 1 o un `resumen` con errores; `avisos`, un `resumen` solo con avisos. */
export function marcaDelEvento({ exitCode, resumen }: EventoDeActividad): { tipo: TipoDeMarca; texto: string } {
  if (exitCode === 2) return { tipo: 'fallo', texto: 'fallo de uso' };
  if (resumen !== undefined && resumen.errores > 0) return { tipo: 'errores', texto: plural(resumen.errores, 'error', 'errores') };
  if (exitCode === 1) return { tipo: 'errores', texto: 'error' };
  if (resumen !== undefined && resumen.avisos > 0) return { tipo: 'avisos', texto: plural(resumen.avisos, 'aviso', 'avisos') };
  return { tipo: 'ok', texto: 'ok' };
}

/** Quien (agente o `pid <n>`). */
export const quienDelEvento = ({ agente, pid }: EventoDeActividad): string => agente ?? `pid ${pid}`;

/** Lo que nombra el objetivo, en una linea (vacio si no nombra nada). */
export function textoDelObjetivo(objetivo: ObjetivoDeActividad | undefined): string {
  if (objetivo === undefined) return '';
  return [objetivo.vista, objetivo.nodo, objetivo.tema, objetivo.archivos?.join(', ')].filter((p) => p !== undefined && p !== '').join(' ');
}

/** "quien comando objetivo": la ultima linea del agente en la barra. */
export const resumenDelEvento = (evento: EventoDeActividad): string => [quienDelEvento(evento), evento.comando, textoDelObjetivo(evento.objetivo)].filter((p) => p !== '').join(' ');

export interface DestinoDelAgente {
  vista: string;
  /** Nodo a seleccionar en `vista`. */
  seleccion?: string;
}

/**
 * Adonde lleva "seguir al agente" (ADR 0005): `vista` navega a esa Vista (y selecciona `nodo` si la Vista lo contiene);
 * `nodo` se queda en la Vista activa si lo contiene o va a la primera Vista, en orden de declaracion, que lo contenga, y
 * lo selecciona; `archivos` no mueve. `undefined`: no hay adonde ir (o lo nombrado no existe en `fuente`).
 */
export function destinoDelObjetivo(objetivo: ObjetivoDeActividad | undefined, fuente: FuenteCanonica, vistaActiva: string | undefined): DestinoDelAgente | undefined {
  if (objetivo === undefined) return undefined;
  const { vista, nodo } = objetivo;
  if (vista !== undefined) {
    if (!fuente.views.some((v) => v.id === vista)) return undefined;
    return nodo !== undefined && vistaMuestra(fuente, vista, nodo) ? { vista, seleccion: nodo } : { vista };
  }
  return nodo === undefined ? undefined : destinoDeNodo(fuente, nodo, vistaActiva);
}

/** Eventos que guarda el feed (los 50 previos mas los que llegan). */
const EVENTOS_EN_EL_FEED = 200;

export interface InstantaneaDelAgente {
  /** Del mas viejo al mas nuevo. */
  eventos: readonly EventoDeActividad[];
  /** Eventos en vivo llegados sin seguir al agente desde la ultima vez que se vio el feed. */
  sinVer: number;
  /** Interruptor "seguir al agente". */
  siguiendo: boolean;
}

export interface ActividadDelAgente extends Observable<InstantaneaDelAgente> {
  /** Cada tanda en vivo (no los `previos`), tras actualizar la instantanea; devuelve la baja. */
  alEnVivo(alEventos: (eventos: readonly EventoDeActividad[]) => void): () => void;
  /** Encender pone el contador a cero. */
  seguir(siguiendo: boolean): void;
  /** El feed se vio: contador a cero. */
  marcarVisto(): void;
}

export function crearActividadDelAgente(cliente: ClienteQueEscucha): ActividadDelAgente {
  const valor = crearValor<InstantaneaDelAgente>({ eventos: [], sinVer: 0, siguiendo: false });
  const enVivo = new Set<(eventos: readonly EventoDeActividad[]) => void>();
  escucharValidado(cliente, 'actividad', actividadDeDevSchema, ({ previos, eventos }) => {
    if (eventos.length === 0) return;
    const actual = valor.instantanea();
    // Una reconexion vuelve a mandar los previos: reemplazan el feed en lugar de duplicarlo.
    const base = previos ? [] : actual.eventos;
    valor.cambiar({
      ...actual,
      eventos: [...base, ...eventos].slice(-EVENTOS_EN_EL_FEED),
      sinVer: previos || actual.siguiendo ? actual.sinVer : actual.sinVer + eventos.length,
    });
    if (!previos) for (const oyente of [...enVivo]) oyente(eventos);
  });
  return {
    instantanea: valor.instantanea,
    suscribir: valor.suscribir,
    alEnVivo(alEventos) {
      enVivo.add(alEventos);
      return () => enVivo.delete(alEventos);
    },
    seguir: (siguiendo) => valor.cambiar({ ...valor.instantanea(), siguiendo, sinVer: siguiendo ? 0 : valor.instantanea().sinVer }),
    marcarVisto() {
      if (valor.instantanea().sinVer !== 0) valor.cambiar({ ...valor.instantanea(), sinVer: 0 });
    },
  };
}

/** Un almacen por cliente: lo comparten el panel Agente y las pildoras de la barra sin pasar por el contexto del marco. */
export const actividadDelCliente = almacenPorCliente(crearActividadDelAgente);

/** El almacen del cliente y su instantanea vigente. */
export function useActividadDelAgente(cliente: ClienteQueEscucha): { almacen: ActividadDelAgente; instantanea: InstantaneaDelAgente } {
  const almacen = actividadDelCliente(cliente);
  return { almacen, instantanea: useObservable(almacen) };
}
