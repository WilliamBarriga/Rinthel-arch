/**
 * Lectura por version: el unico sitio con la guarda contra respuestas viejas. Un pedido se repite con cada `version`
 * (y al cambiar su `clave` o el cliente); la respuesta de un pedido reemplazado se descarta. Lo usan Detalle, la ficha
 * de Tema, el Buscador, Codigo, la previsualizacion de Tema y la carga de Componentes.
 */
import { useEffect, useState } from 'react';

import type { SalidaDeInspect } from 'canonico';

import type { ComandoDeInspect } from '../../src/protocolo';
import type { ClienteDeDev, Lectura } from '../cliente';

/** Lo que ve la UI de una lectura por version. */
export type EstadoDeLectura<T> = { tipo: 'cargando' } | { tipo: 'dato'; dato: T } | { tipo: 'fallo'; mensaje: string };

export interface PedidoDeLectura<T> {
  /** Identifica lo pedido: al cambiar, la lectura vuelve a `cargando`. Con la misma clave, una version nueva conserva el ultimo resultado hasta que llega el siguiente. */
  clave: string;
  /** La `Lectura` del cliente; si rechaza, cuenta como `fallo` con su mensaje. */
  pedir(cliente: ClienteDeDev): Promise<Lectura<T>>;
  /** Un fallo no reemplaza un dato ya leido con la misma clave (p. ej. el listado de Codigo ante un error de red). */
  conservarAnteFallo?: boolean;
}

const CARGANDO = { tipo: 'cargando' } as const;

/** Sin `pedido` (no hay nada que leer) queda en `cargando`. */
export function useLecturaPorVersion<T>(cliente: ClienteDeDev, version: number | undefined, pedido: PedidoDeLectura<T> | undefined): EstadoDeLectura<T> {
  const [leida, setLeida] = useState<{ clave: string; lectura: EstadoDeLectura<T> }>();
  const clave = pedido?.clave;
  useEffect(() => {
    // El pedido de una misma clave es el mismo: basta el del render en que cambio la clave, la version o el cliente.
    const actual = pedido;
    if (actual === undefined) return;
    let descartada = false;
    const guardar = (lectura: EstadoDeLectura<T>): void => {
      if (descartada) return;
      setLeida((previa) => (lectura.tipo === 'fallo' && actual.conservarAnteFallo === true && previa?.clave === actual.clave && previa.lectura.tipo === 'dato' ? previa : { clave: actual.clave, lectura }));
    };
    actual.pedir(cliente).then(
      (r) => guardar(r.ok ? { tipo: 'dato', dato: r.valor } : { tipo: 'fallo', mensaje: r.message }),
      (error: unknown) => guardar({ tipo: 'fallo', mensaje: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      descartada = true;
    };
  }, [cliente, version, clave]);
  return leida !== undefined && leida.clave === clave ? leida.lectura : CARGANDO;
}

type SalidaDe<C extends ComandoDeInspect> = Extract<SalidaDeInspect, { command: C }>;

/** `inspect <comando> <argumento>` por version, con la salida ya estrechada a ese comando; sin `argumento` no pide nada. */
export function useInspectPorVersion<C extends ComandoDeInspect>(cliente: ClienteDeDev, version: number | undefined, comando: C, argumento: string | undefined): EstadoDeLectura<SalidaDe<C>> {
  return useLecturaPorVersion(
    cliente,
    version,
    argumento === undefined
      ? undefined
      : {
          clave: argumento,
          pedir: async (c) => {
            const r = await c.inspeccionar(comando, argumento);
            if (!r.ok) return r;
            return r.salida.command === comando ? { ok: true, valor: r.salida as SalidaDe<C> } : { ok: false, message: 'Unexpected response from inspect' };
          },
        },
  );
}
