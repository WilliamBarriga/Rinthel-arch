/**
 * Almacen de las Diferencias externas, uno por cliente de `dev` (como el del agente): oye `event: diferencia`, descarta
 * las propias y guarda las externas hasta que llega el estado de su `version` (la proyeccion necesita esa Fuente).
 * Lo une al `Resaltado` quien conoce la Vista activa (`useDiferenciasExternas` en el marco); el indice, la galeria y el
 * panel Agente solo leen.
 */
import { diferenciaDeDevSchema } from '../../src/protocolo';
import type { DiferenciaDeDev } from '../../src/protocolo';
import { almacenPorCliente, crearValor, escucharValidado, useObservable } from '../almacen';
import type { ClienteQueEscucha, Observable } from '../almacen';
import { RESALTADO_VACIO } from './proyeccion';
import type { Resaltado } from './proyeccion';

export interface InstantaneaDeDiferencias {
  resaltado: Resaltado;
  /** Diferencias externas aun sin unir, en orden de llegada. */
  pendientes: readonly DiferenciaDeDev[];
}

export interface AlmacenDeDiferencias extends Observable<InstantaneaDeDiferencias> {
  /** Saca las pendientes con `version <= hasta` (las que ya tienen su estado). */
  tomarPendientes(hasta: number): DiferenciaDeDev[];
  actualizar(cambio: (resaltado: Resaltado) => Resaltado): void;
}

export function crearAlmacenDeDiferencias(cliente: ClienteQueEscucha): AlmacenDeDiferencias {
  const valor = crearValor<InstantaneaDeDiferencias>({ resaltado: RESALTADO_VACIO, pendientes: [] });
  escucharValidado(cliente, 'diferencia', diferenciaDeDevSchema, (diferencia) => {
    if (diferencia.origen !== 'externo') return;
    const actual = valor.instantanea();
    valor.cambiar({ ...actual, pendientes: [...actual.pendientes, diferencia] });
  });
  return {
    instantanea: valor.instantanea,
    suscribir: valor.suscribir,
    tomarPendientes(hasta) {
      const actual = valor.instantanea();
      const listas = actual.pendientes.filter((d) => d.version <= hasta);
      if (listas.length > 0) valor.cambiar({ ...actual, pendientes: actual.pendientes.filter((d) => d.version > hasta) });
      return listas;
    },
    actualizar(cambio) {
      const actual = valor.instantanea();
      const resaltado = cambio(actual.resaltado);
      if (resaltado !== actual.resaltado) valor.cambiar({ ...actual, resaltado });
    },
  };
}

export const diferenciasDelCliente = almacenPorCliente(crearAlmacenDeDiferencias);

export function useDiferencias(cliente: ClienteQueEscucha): { almacen: AlmacenDeDiferencias; instantanea: InstantaneaDeDiferencias } {
  const almacen = diferenciasDelCliente(cliente);
  return { almacen, instantanea: useObservable(almacen) };
}
