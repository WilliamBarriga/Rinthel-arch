/**
 * Historial visible de `dev`: el ultimo `event: historial` de la conexion, guardado por cliente para que el panel lo
 * tenga aunque se monte despues de conectar. `horaRelativa` es pura.
 */
import { historialDeDevSchema } from '../../src/protocolo';
import type { HistorialDeDev } from '../../src/protocolo';
import { almacenPorCliente, crearValor, escucharValidado, useObservable } from '../almacen';
import type { ClienteQueEscucha, Observable } from '../almacen';

/** `undefined` hasta el primer `event: historial`. */
export type AlmacenDelHistorial = Observable<HistorialDeDev | undefined>;

/** Crea (una vez por cliente) el almacen que escucha `event: historial`; llamarlo al conectar para no perder el primero. */
export const historialDelCliente = almacenPorCliente((cliente): AlmacenDelHistorial => {
  const valor = crearValor<HistorialDeDev | undefined>(undefined);
  escucharValidado(cliente, 'historial', historialDeDevSchema, valor.cambiar);
  return valor;
});

export const useHistorialVisible = (cliente: ClienteQueEscucha): HistorialDeDev | undefined => useObservable(historialDelCliente(cliente));

/** "now", "12 s ago", "3 min ago", "2 h ago" or "4 d ago"; `cuando` y `ahora` en ms. */
export function horaRelativa(cuando: number, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - cuando) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
