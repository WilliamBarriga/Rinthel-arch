/**
 * Registro de actividad vivo: lo que `dev` muestra del Registro de actividad (`.diagrams/activity.jsonl`), sin disco ni
 * reloj propios. `conexion()` da el evento `actividad` con `previos: true` y los ultimos `EVENTOS_PREVIOS` Eventos; cada
 * aviso del observador del registro, con debounce, empuja por `escuchar` los Eventos nuevos (`previos: false`).
 * Invariantes: lectura incremental tolerante (lineas rotas; un archivo acortado, rotado o borrado se relee desde el
 * principio); no comparte estado con la Sesion. Errores: un fallo de lectura se ignora y el siguiente aviso reintenta.
 */
import { createActivityReader } from 'canonical';
import type { ActivityEvent, DevEvent } from 'canonical';

import { debounce } from './reloj';
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

/** La rama `actividad` de los eventos de `/eventos`. */
export type EventoDeActividadDeDev = Extract<DevEvent, { name: 'actividad' }>;

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
  const leerActividad = createActivityReader();
  const leer = (): ActivityEvent[] => {
    try {
      return leerActividad(registro?.leer());
    } catch {
      return []; // el siguiente aviso reintenta
    }
  };
  let previos = leer().slice(-EVENTOS_PREVIOS);
  const oyentes = new Set<(evento: EventoDeActividadDeDev) => void>();
  const lectura = debounce(reloj, debounceMs);
  const dejarDeObservar =
    registro?.observar(() =>
      lectura.programar(() => {
        const nuevos = leer();
        if (nuevos.length === 0) return;
        previos = [...previos, ...nuevos].slice(-EVENTOS_PREVIOS);
        const evento: EventoDeActividadDeDev = { name: 'actividad', data: { previos: false, eventos: nuevos } };
        for (const oyente of [...oyentes]) oyente(evento);
      }),
    ) ?? (() => undefined);

  return {
    conexion: () => ({ name: 'actividad', data: { previos: true, eventos: [...previos] } }),
    escuchar(alEvento) {
      oyentes.add(alEvento);
      return () => void oyentes.delete(alEvento);
    },
    cerrar() {
      lectura.cancelar();
      dejarDeObservar();
    },
  };
}
