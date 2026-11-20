/**
 * Andamiaje de los almacenes por cliente de `dev` (Historial, Diferencias, actividad del agente): un valor observable,
 * la memoria de un almacen por cliente (WeakMap) y la escucha de un evento SSE validado con su esquema.
 * Invariantes: un almacen se crea una sola vez por cliente y oye desde ese momento (crearlo al conectar para no perder
 * el primer evento); un evento que no valida se ignora.
 */
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import type { NombreDeEventoDeDev } from '../src/protocolo';
import type { ClienteDeDev } from './cliente';

export type ClienteQueEscucha = Pick<ClienteDeDev, 'escuchar'>;

/** Valor con oyentes, para `useSyncExternalStore`. */
export interface Observable<T> {
  instantanea(): T;
  suscribir(alCambiar: () => void): () => void;
}

export interface Valor<T> extends Observable<T> {
  /** Avisa solo si cambia (por identidad). */
  cambiar(siguiente: T): void;
}

export function crearValor<T>(inicial: T): Valor<T> {
  let actual = inicial;
  const oyentes = new Set<() => void>();
  return {
    instantanea: () => actual,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
    cambiar(siguiente) {
      if (siguiente === actual) return;
      actual = siguiente;
      for (const oyente of [...oyentes]) oyente();
    },
  };
}

/** `crear` corre una vez por cliente; las llamadas siguientes devuelven el mismo almacen. */
export function almacenPorCliente<A>(crear: (cliente: ClienteQueEscucha) => A): (cliente: ClienteQueEscucha) => A {
  const porCliente = new WeakMap<ClienteQueEscucha, A>();
  return (cliente) => {
    let almacen = porCliente.get(cliente);
    if (almacen === undefined) {
      almacen = crear(cliente);
      porCliente.set(cliente, almacen);
    }
    return almacen;
  };
}

/** Escucha `event: <nombre>` y entrega solo los datos que validan con `esquema`. */
export function escucharValidado<T>(cliente: ClienteQueEscucha, nombre: NombreDeEventoDeDev, esquema: z.ZodType<T>, alDato: (dato: T) => void): void {
  cliente.escuchar(nombre, (datos) => {
    const leido = esquema.safeParse(datos);
    if (leido.success) alDato(leido.data);
  });
}

export const useObservable = <T,>(almacen: Observable<T>): T => useSyncExternalStore(almacen.suscribir, almacen.instantanea);
