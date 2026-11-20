/**
 * Historial visible de `dev`: el ultimo `event: historial` de la conexion, guardado por cliente para que el panel lo
 * tenga aunque se monte despues de conectar. `horaRelativa` es pura.
 */
import { useSyncExternalStore } from 'react';

import { historialDeDevSchema } from '../../src/protocolo';
import type { HistorialDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';

export interface AlmacenDelHistorial {
  /** `undefined` hasta el primer `event: historial`. */
  instantanea(): HistorialDeDev | undefined;
  suscribir(alCambiar: () => void): () => void;
}

const porCliente = new WeakMap<Pick<ClienteDeDev, 'escuchar'>, AlmacenDelHistorial>();

/** Crea (una vez por cliente) el almacen que escucha `event: historial`; llamarlo al conectar para no perder el primero. */
export function historialDelCliente(cliente: Pick<ClienteDeDev, 'escuchar'>): AlmacenDelHistorial {
  const existente = porCliente.get(cliente);
  if (existente !== undefined) return existente;
  let actual: HistorialDeDev | undefined;
  const oyentes = new Set<() => void>();
  cliente.escuchar('historial', (datos) => {
    const leido = historialDeDevSchema.safeParse(datos);
    if (!leido.success) return;
    actual = leido.data;
    for (const oyente of [...oyentes]) oyente();
  });
  const almacen: AlmacenDelHistorial = {
    instantanea: () => actual,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
  };
  porCliente.set(cliente, almacen);
  return almacen;
}

export function useHistorialVisible(cliente: Pick<ClienteDeDev, 'escuchar'>): HistorialDeDev | undefined {
  const almacen = historialDelCliente(cliente);
  return useSyncExternalStore(almacen.suscribir, almacen.instantanea);
}

/** "ahora", "hace 12 s", "hace 3 min", "hace 2 h" o "hace 4 d"; `cuando` y `ahora` en ms. */
export function horaRelativa(cuando: number, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - cuando) / 1000));
  if (s < 5) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86_400)} d`;
}
