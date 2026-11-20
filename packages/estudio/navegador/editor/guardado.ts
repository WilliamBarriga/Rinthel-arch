/**
 * Guardado automatico de un archivo del editor, sin React ni DOM: acumula los cambios del buffer desde la ultima base
 * guardada y los manda como ediciones minimas (`POST /api/edit { ediciones, version, aunqueNoCompile: true }`) ~400 ms
 * despues del ultimo cambio, o ya con `guardar()` (Mod+S, perder el foco, antes de deshacer, rehacer o saltar en `dev`).
 * Invariantes: un solo envio a la vez; lo que se teclea durante un envio se guarda despues sobre la base nueva. Un
 * rechazo deja los cambios pendientes y el estado `error` (la reconciliacion con el disco, #191, decide que hacer ante 409).
 */
import { ChangeSet, Text } from '@codemirror/state';

import type { ResultadoDeEnvio } from '../cliente';
import type { PeticionDeEdiciones } from '../../src/protocolo';
import { edicionesDesdeCambios } from './cambios';

/** Espera tras el ultimo cambio antes de guardar (ADR 0007). */
export const ESPERA_DEL_GUARDADO_MS = 400;

export type EstadoDelGuardado = { tipo: 'guardado' } | { tipo: 'sin-guardar' } | { tipo: 'guardando' } | { tipo: 'error'; mensaje: string; desactualizado: boolean };

export interface OpcionesDelGuardador {
  file: string;
  /** Texto del archivo tal como esta en disco en `version`. */
  base: string;
  version: number;
  enviar(peticion: PeticionDeEdiciones): Promise<ResultadoDeEnvio>;
  alCambiarEstado?(estado: EstadoDelGuardado): void;
  esperaMs?: number;
}

export interface Guardador {
  /** Registra cambios del buffer (deben partir del documento vigente) y programa el guardado. */
  cambiar(cambios: ChangeSet): void;
  /** Guarda ya lo pendiente y espera a que termine (sin pendientes, resuelve al acabar el envio en curso). */
  guardar(): Promise<void>;
  /** Hay cambios sin confirmar por `dev` (pendientes o en vuelo). */
  sucio(): boolean;
  estado(): EstadoDelGuardado;
  /** Texto y `version` de la ultima base confirmada. */
  base(): { texto: string; version: number };
  /** Cancela el temporizador (no manda nada). */
  cerrar(): void;
}

export function crearGuardador(opciones: OpcionesDelGuardador): Guardador {
  const { file, enviar, alCambiarEstado = () => undefined, esperaMs = ESPERA_DEL_GUARDADO_MS } = opciones;
  let base = opciones.base;
  let version = opciones.version;
  let pendiente = ChangeSet.empty(base.length);
  let enVuelo: Promise<void> | undefined;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let estado: EstadoDelGuardado = { tipo: 'guardado' };
  const fijar = (nuevo: EstadoDelGuardado): void => {
    estado = nuevo;
    alCambiarEstado(nuevo);
  };
  const cancelar = (): void => {
    clearTimeout(temporizador);
    temporizador = undefined;
  };

  const enviarPendiente = async (): Promise<void> => {
    if (pendiente.empty) return;
    const enviado = pendiente;
    const ediciones = edicionesDesdeCambios(file, base, enviado);
    pendiente = ChangeSet.empty(enviado.newLength);
    fijar({ tipo: 'guardando' });
    const r = await enviar({ ediciones, version, aunqueNoCompile: true });
    if (r.ok) {
      base = enviado.apply(Text.of(base.split('\n'))).toString();
      if (r.version !== undefined) version = r.version;
      fijar(pendiente.empty ? { tipo: 'guardado' } : { tipo: 'sin-guardar' });
    } else {
      pendiente = enviado.compose(pendiente);
      fijar({ tipo: 'error', mensaje: r.mensaje, desactualizado: r.desactualizado });
    }
  };

  const guardar = async (): Promise<void> => {
    cancelar();
    while (enVuelo !== undefined) await enVuelo;
    if (pendiente.empty) return;
    enVuelo = enviarPendiente().finally(() => {
      enVuelo = undefined;
    });
    await enVuelo;
  };

  return {
    cambiar(cambios) {
      if (cambios.empty) return;
      pendiente = pendiente.compose(cambios);
      if (estado.tipo !== 'guardando') fijar({ tipo: 'sin-guardar' });
      cancelar();
      temporizador = setTimeout(() => {
        temporizador = undefined;
        void guardar();
      }, esperaMs);
    },
    guardar,
    sucio: () => !pendiente.empty || enVuelo !== undefined,
    estado: () => estado,
    base: () => ({ texto: base, version }),
    cerrar: cancelar,
  };
}
