/**
 * Guardado automatico de un archivo del editor, sin React ni DOM: acumula los cambios del buffer desde la ultima base
 * guardada y los manda como ediciones minimas (`POST /api/edit { ediciones, version, aunqueNoCompile: true }`) ~400 ms
 * despues del ultimo cambio, o ya con `guardar()` (Mod+S, perder el foco, antes de deshacer, rehacer o saltar en `dev`).
 * Escrituras externas (#191): ante un 409 lee el disco, une con `fusionarTresVias` (gana el disco si solapa), entrega la
 * Fusion a `alReconciliar` (el editor la despacha anotada `desdeElDisco`) y reintenta sobre la version nueva;
 * `sincronizar({ hash, version })` hace lo mismo cuando `dev` anuncia otro hash del archivo, y si el hash es el de la base
 * (el eco de un guardado propio, o un cambio en otro archivo) solo adopta la version, sin leer ni tocar el buffer.
 * Invariantes: envios y reconciliaciones van en serie; lo que se teclea durante un envio se guarda despues sobre la base
 * nueva; `pendiente` siempre lleva la base al buffer. Otro rechazo deja los cambios pendientes y el estado `error`.
 */
import { hashDeContenido } from 'canonico';
import { ChangeSet, Text } from '@codemirror/state';

import type { ResultadoDeEnvio } from '../cliente';
import type { PeticionDeEdiciones } from '../../src/protocolo';
import { edicionesDesdeCambios } from './cambios';
import { fusionarTresVias } from './reconciliacion';
import type { Fusion } from './reconciliacion';

/** Reintentos de un guardado rechazado con 409 (cada uno tras reconciliar con el disco). */
const REINTENTOS_TRAS_409 = 3;

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
  /** Lee el archivo en disco con la `version` del estado que lo incluye; `undefined` si no se pudo. */
  leerDisco?(): Promise<{ texto: string; version: number } | undefined>;
  /** Recibe cada Fusion con el disco; debe aplicar `alBuffer` al buffer en el acto, sin guardarlo. */
  alReconciliar?(fusion: Fusion): void;
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
  /** `dev` anuncia el `hash` del archivo en `version`: si no es el de la base, lee el disco y reconcilia. */
  sincronizar(enDisco: { hash: string; version: number }): Promise<void>;
  /** Texto y `version` de la ultima base confirmada. */
  base(): { texto: string; version: number };
  /** Cancela el temporizador (no manda nada). */
  cerrar(): void;
}

export function crearGuardador(opciones: OpcionesDelGuardador): Guardador {
  const { file, enviar, alCambiarEstado = () => undefined, leerDisco = async () => undefined, alReconciliar = () => undefined, esperaMs = ESPERA_DEL_GUARDADO_MS } = opciones;
  let base = opciones.base;
  let version = opciones.version;
  let pendiente = ChangeSet.empty(base.length);
  let enVuelo = false;
  let cola: Promise<void> = Promise.resolve();
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
  const enSerie = (tarea: () => Promise<void>): Promise<void> => {
    const r = cola.then(tarea);
    cola = r.catch(() => undefined);
    return r;
  };
  const programar = (): void => {
    cancelar();
    temporizador = setTimeout(() => {
      temporizador = undefined;
      void guardar();
    }, esperaMs);
  };
  const aplicar = (cambios: ChangeSet, texto: string): string => cambios.apply(Text.of(texto.split('\n'))).toString();

  const enviarPendiente = async (): Promise<ResultadoDeEnvio> => {
    const enviado = pendiente;
    const ediciones = edicionesDesdeCambios(file, base, enviado);
    pendiente = ChangeSet.empty(enviado.newLength);
    fijar({ tipo: 'guardando' });
    enVuelo = true;
    const r = await enviar({ ediciones, version, aunqueNoCompile: true }).finally(() => {
      enVuelo = false;
    });
    if (r.ok) {
      base = aplicar(enviado, base);
      if (r.version !== undefined) version = r.version;
      fijar(pendiente.empty ? { tipo: 'guardado' } : { tipo: 'sin-guardar' });
    } else {
      pendiente = enviado.compose(pendiente);
      fijar({ tipo: 'error', mensaje: r.message, desactualizado: r.desactualizado });
    }
    return r;
  };

  /** Une el buffer con el disco; `false` si no se pudo leer. */
  const reconciliar = async (): Promise<boolean> => {
    const disco = await leerDisco();
    if (disco === undefined) return false;
    // Sin `await` desde aqui: lo tecleado mientras se leia ya esta en `pendiente`.
    const fusion = fusionarTresVias(base, disco.texto, aplicar(pendiente, base));
    base = disco.texto;
    version = disco.version;
    pendiente = fusion.pendiente;
    if (!fusion.alBuffer.empty || fusion.perdidos.length > 0) alReconciliar(fusion);
    fijar(pendiente.empty ? { tipo: 'guardado' } : { tipo: 'sin-guardar' });
    return true;
  };

  const guardar = (): Promise<void> => {
    cancelar();
    return enSerie(async () => {
      for (let intento = 0; intento <= REINTENTOS_TRAS_409 && !pendiente.empty; intento++) {
        const r = await enviarPendiente();
        if (r.ok || !r.desactualizado || intento === REINTENTOS_TRAS_409 || !(await reconciliar())) return;
      }
    });
  };

  const sincronizar = (enDisco: { hash: string; version: number }): Promise<void> =>
    enSerie(async () => {
      if (enDisco.hash === hashDeContenido(base)) {
        version = Math.max(version, enDisco.version);
        return;
      }
      if ((await reconciliar()) && !pendiente.empty) programar();
    });

  return {
    cambiar(cambios) {
      if (cambios.empty) return;
      pendiente = pendiente.compose(cambios);
      if (estado.tipo !== 'guardando') fijar({ tipo: 'sin-guardar' });
      programar();
    },
    guardar,
    sincronizar,
    sucio: () => !pendiente.empty || enVuelo,
    estado: () => estado,
    base: () => ({ texto: base, version }),
    cerrar: cancelar,
  };
}
