/**
 * Geometria de la Vista activa con cache por estructura (ADR 0004): el adaptador
 * de layout solo se llama en estados no cacheados. La geometria por defecto
 * (la que trae el build) entra como semilla y no cuesta relayout.
 */
import { useEffect, useRef, useState } from 'react';

import type { Tema, VistaResuelta } from 'canonico';
import { claveDeLayout } from 'layout';
import type { Geometria } from 'layout';

import type { AdaptadorDeLayout } from './vista-interactiva';

export interface Calculo {
  vista: VistaResuelta;
  geometria: Geometria;
}

export interface EntradaDeGeometria {
  vista: VistaResuelta;
  theme: Tema;
  layout: AdaptadorDeLayout;
  /** Geometria del estado por defecto de la Vista (cacheada en el build), con la Vista resuelta a la que corresponde. */
  semilla?: Calculo | undefined;
  /** Cambia cuando la cache deja de valer (Fuente o Vista distintas). */
  invalidar: unknown;
  onError?: ((error: Error) => void) | undefined;
  /** Llega una geometria nueva; `previo` es la que se mostraba. Se llama antes de mostrarla. */
  alLlegar?: ((previo: Calculo | undefined, nuevo: Calculo) => void) | undefined;
}

const MAX_CACHE = 32;

/** Devuelve el ultimo `Calculo` vigente. Un fallo del adaptador va a `onError` o se lanza al renderizar. */
export function useGeometria(entrada: EntradaDeGeometria): Calculo | undefined {
  const { vista, theme, layout, semilla, invalidar } = entrada;
  const [calculo, setCalculo] = useState<Calculo>();
  const [fallo, setFallo] = useState<Error>();
  const ultimo = useRef(entrada);
  ultimo.current = entrada;
  const mostrado = useRef<Calculo | undefined>(undefined);
  const cache = useRef<{ llave: [unknown, AdaptadorDeLayout]; mapa: Map<string, Geometria> } | undefined>(undefined);

  useEffect(() => {
    if (cache.current === undefined || cache.current.llave[0] !== invalidar || cache.current.llave[1] !== layout) {
      cache.current = { llave: [invalidar, layout], mapa: new Map() };
    }
    const mapa = cache.current.mapa;
    const clave = claveDeLayout(vista, theme);
    const recibir = (geometria: Geometria): void => {
      mapa.delete(clave);
      mapa.set(clave, geometria);
      if (mapa.size > MAX_CACHE) mapa.delete(mapa.keys().next().value!);
      const nuevo = { vista, geometria };
      ultimo.current.alLlegar?.(mostrado.current, nuevo);
      mostrado.current = nuevo;
      setCalculo(nuevo);
    };

    let vigente = true;
    const cacheada =
      mapa.get(clave) ?? (semilla !== undefined && claveDeLayout(semilla.vista, theme) === clave ? semilla.geometria : undefined);
    if (cacheada !== undefined) {
      recibir(cacheada);
    } else {
      layout(vista, theme).then(
        (geometria) => {
          if (vigente) recibir(geometria);
        },
        (error: unknown) => {
          if (!vigente) return;
          const e = error instanceof Error ? error : new Error(String(error));
          if (ultimo.current.onError === undefined) setFallo(e);
          else ultimo.current.onError(e);
        },
      );
    }
    return () => {
      vigente = false;
    };
  }, [vista, theme, layout, invalidar, semilla]);

  if (fallo !== undefined) throw fallo;
  return calculo;
}
