/**
 * Registro de actividad vivo: lo que `dev` muestra del Registro de actividad (`.diagrams/actividad.jsonl`), sin disco ni
 * reloj propios. `conexion()` da el evento `actividad` con `previos: true` y los ultimos `EVENTOS_PREVIOS` Eventos; cada
 * aviso del observador del registro, con debounce, empuja por `escuchar` los Eventos nuevos (`previos: false`).
 * Invariantes: lectura incremental tolerante (lineas rotas; un archivo acortado, rotado o borrado se relee desde el
 * principio); no comparte estado con la Sesion. Errores: un fallo de lectura se ignora y el siguiente aviso reintenta.
 */
import { crearLectorDeActividad } from 'canonico';
import type { ActividadDeDev, EventoDeActividad } from 'canonico';

import type { Reloj } from './reloj';

/** El registro en el adaptador, con su observador propio (el watcher del Workspace ignora carpetas ocultas). */
export interface RegistroDeActividad {
  /** Texto entero del registro, o `undefined` si no existe. */
  leer(): string | undefined;
  /** Devuelve como dejar de observar. */
  observar(alCambiar: () => void): () => void;
}

/** Eventos de actividad que `dev` reproduce al conectar. */
const EVENTOS_PREVIOS = 50;

export interface EventoDeActividadDeDev {
  nombre: 'actividad';
  datos: ActividadDeDev;
}

export interface OpcionesDelRegistroDeActividadVivo {
  /** Sin el, no hay actividad: conecta sin Eventos y nunca empuja. */
  registro?: RegistroDeActividad;
  reloj: Reloj;
  /** Espera en ms tras el ultimo aviso antes de leer. */
  debounceMs: number;
}

export interface RegistroDeActividadVivo {
  /** Lo que recibe un cliente al conectar. */
  conexion(): EventoDeActividadDeDev;
  /** Una tanda por debounce, solo si trae Eventos. Devuelve como dejar de escuchar. */
  escuchar(alEvento: (evento: EventoDeActividadDeDev) => void): () => void;
  /** Deja de observar y cancela el debounce pendiente. */
  cerrar(): void;
}

export function abrirRegistroDeActividadVivo({ registro, reloj, debounceMs }: OpcionesDelRegistroDeActividadVivo): RegistroDeActividadVivo {
  const leerActividad = crearLectorDeActividad();
  const leer = (): EventoDeActividad[] => {
    try {
      return leerActividad(registro?.leer());
    } catch {
      return []; // el siguiente aviso reintenta
    }
  };
  let previos = leer().slice(-EVENTOS_PREVIOS);
  const oyentes = new Set<(evento: EventoDeActividadDeDev) => void>();
  let cancelar: (() => void) | undefined;
  const dejarDeObservar =
    registro?.observar(() => {
      cancelar?.();
      cancelar = reloj.programar(() => {
        cancelar = undefined;
        const nuevos = leer();
        if (nuevos.length === 0) return;
        previos = [...previos, ...nuevos].slice(-EVENTOS_PREVIOS);
        const evento: EventoDeActividadDeDev = { nombre: 'actividad', datos: { previos: false, eventos: nuevos } };
        for (const oyente of [...oyentes]) oyente(evento);
      }, debounceMs);
    }) ?? (() => undefined);

  return {
    conexion: () => ({ nombre: 'actividad', datos: { previos: true, eventos: [...previos] } }),
    escuchar(alEvento) {
      oyentes.add(alEvento);
      return () => void oyentes.delete(alEvento);
    },
    cerrar() {
      cancelar?.();
      cancelar = undefined;
      dejarDeObservar();
    },
  };
}
