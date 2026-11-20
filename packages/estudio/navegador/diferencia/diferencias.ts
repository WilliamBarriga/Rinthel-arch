/**
 * Almacen de las Diferencias externas, uno por cliente de `dev` (como el del agente): oye `event: diferencia`, descarta
 * las propias y guarda las externas hasta que llega el estado de su `version` (la proyeccion necesita esa Fuente).
 * Lo une al `Resaltado` quien conoce la Vista activa (`useDiferenciasExternas` en el marco); el indice, la galeria y el
 * panel Agente solo leen.
 */
import { useSyncExternalStore } from 'react';

import { diferenciaDeDevSchema } from '../../src/protocolo';
import type { DiferenciaDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import { RESALTADO_VACIO } from './proyeccion';
import type { Resaltado } from './proyeccion';

export interface InstantaneaDeDiferencias {
  resaltado: Resaltado;
  /** Diferencias externas aun sin unir, en orden de llegada. */
  pendientes: readonly DiferenciaDeDev[];
}

export interface AlmacenDeDiferencias {
  instantanea(): InstantaneaDeDiferencias;
  suscribir(alCambiar: () => void): () => void;
  /** Saca las pendientes con `version <= hasta` (las que ya tienen su estado). */
  tomarPendientes(hasta: number): DiferenciaDeDev[];
  actualizar(cambio: (resaltado: Resaltado) => Resaltado): void;
}

export function crearAlmacenDeDiferencias(cliente: Pick<ClienteDeDev, 'escuchar'>): AlmacenDeDiferencias {
  let actual: InstantaneaDeDiferencias = { resaltado: RESALTADO_VACIO, pendientes: [] };
  const oyentes = new Set<() => void>();
  const cambiar = (siguiente: InstantaneaDeDiferencias): void => {
    actual = siguiente;
    for (const oyente of [...oyentes]) oyente();
  };
  cliente.escuchar('diferencia', (datos) => {
    const leida = diferenciaDeDevSchema.safeParse(datos);
    if (!leida.success || leida.data.origen !== 'externo') return;
    cambiar({ ...actual, pendientes: [...actual.pendientes, leida.data] });
  });
  return {
    instantanea: () => actual,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => oyentes.delete(alCambiar);
    },
    tomarPendientes(hasta) {
      const listas = actual.pendientes.filter((d) => d.version <= hasta);
      if (listas.length > 0) cambiar({ ...actual, pendientes: actual.pendientes.filter((d) => d.version > hasta) });
      return listas;
    },
    actualizar(cambio) {
      const resaltado = cambio(actual.resaltado);
      if (resaltado !== actual.resaltado) cambiar({ ...actual, resaltado });
    },
  };
}

const porCliente = new WeakMap<Pick<ClienteDeDev, 'escuchar'>, AlmacenDeDiferencias>();

export function diferenciasDelCliente(cliente: Pick<ClienteDeDev, 'escuchar'>): AlmacenDeDiferencias {
  let almacen = porCliente.get(cliente);
  if (almacen === undefined) {
    almacen = crearAlmacenDeDiferencias(cliente);
    porCliente.set(cliente, almacen);
  }
  return almacen;
}

export function useDiferencias(cliente: Pick<ClienteDeDev, 'escuchar'>): { almacen: AlmacenDeDiferencias; instantanea: InstantaneaDeDiferencias } {
  const almacen = diferenciasDelCliente(cliente);
  const instantanea = useSyncExternalStore(almacen.suscribir, almacen.instantanea);
  return { almacen, instantanea };
}
