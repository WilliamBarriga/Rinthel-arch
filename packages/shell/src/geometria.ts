/**
 * Geometria de la Vista activa con cache por estructura (ADR 0003): el adaptador
 * de layout solo se llama en estados no cacheados. La geometria por defecto
 * (la que trae el build) entra como semilla y no cuesta relayout. La cache guarda la geometria que
 * calcula ELK sin Pins, por clave de estructura; los Pins se aplican despues de forma sincrona
 * (`aplicarPinsAGeometria`), asi mover un Pin, aun de forma continua, no vuelve a llamar al adaptador.
 */
import { useEffect, useRef, useState } from 'react';

import type { Tema, VistaResuelta } from 'canonico';
import { aplicarPinsAGeometria, claveDeEstructura, claveDeLayout } from 'layout';
import type { Geometria } from 'layout';
import { tablaDeMetricas, textosAMedir } from 'tema';
import type { MedidasDeTexto } from 'tema';

import type { AdaptadorDeLayout, MedidorDeTexto } from './vista-interactiva';

export interface Calculo {
  vista: VistaResuelta;
  geometria: Geometria;
}

export interface EntradaDeGeometria {
  vista: VistaResuelta;
  theme: Tema;
  layout: AdaptadorDeLayout;
  /** Medicion real de texto; si esta, el layout espera las medidas y la clave incluye nivel y hash de fuente. */
  medir?: MedidorDeTexto | undefined;
  /** Identidad de las fuentes que usa el medidor (hash de sus archivos): si cambia, se vuelve a medir aunque los textos sean los mismos. */
  claveDeFuentes?: string | undefined;
  /** Geometria del estado por defecto de la Vista (cacheada en el build), con la Vista resuelta a la que corresponde. */
  semilla?: Calculo | undefined;
  onError?: ((error: Error) => void) | undefined;
  /** Llega una geometria nueva; `previo` es la que se mostraba. Se llama antes de mostrarla. */
  alLlegar?: ((previo: Calculo | undefined, nuevo: Calculo) => void) | undefined;
}

const MAX_CACHE = 32;

/** Devuelve el ultimo `Calculo` vigente. Un fallo del adaptador va a `onError` o se lanza al renderizar. */
export function useGeometria(entrada: EntradaDeGeometria): Calculo | undefined {
  const { vista, theme, layout, semilla } = entrada;
  const [calculo, setCalculo] = useState<Calculo>();
  const [fallo, setFallo] = useState<Error>();
  const ultimo = useRef(entrada);
  ultimo.current = entrada;
  // Medidas reales: se piden cuando cambian los textos o las fuentes y el layout espera a tenerlas.
  const textos = entrada.medir === undefined ? undefined : textosAMedir(vista, tablaDeMetricas(theme));
  const claveTextos = textos === undefined ? undefined : JSON.stringify([entrada.claveDeFuentes, textos]);
  const [medido, setMedido] = useState<{ clave: string; medidas: MedidasDeTexto }>();
  useEffect(() => {
    if (claveTextos === undefined) return;
    let vigente = true;
    ultimo.current.medir!(textos!).then(
      (medidas) => vigente && setMedido({ clave: claveTextos, medidas }),
      (error: unknown) => {
        if (!vigente) return;
        const e = error instanceof Error ? error : new Error(String(error));
        if (ultimo.current.onError === undefined) setFallo(e);
        else ultimo.current.onError(e);
      },
    );
    return () => {
      vigente = false;
    };
  }, [claveTextos]);
  const medidas = claveTextos !== undefined && medido?.clave === claveTextos ? medido.medidas : undefined;
  const esperando = claveTextos !== undefined && medidas === undefined;
  // Solo lo que mueve el layout (estructura, textos, fuentes, origen de las medidas) lo repite; la paleta no.
  const tabla = tablaDeMetricas(theme, medidas);
  const claveTema = claveDeLayout(vista, theme, tabla);
  const claveBase = claveDeEstructura(vista, theme, tabla);
  const mostrado = useRef<Calculo | undefined>(undefined);
  const cache = useRef<{ llave: AdaptadorDeLayout; mapa: Map<string, Geometria> } | undefined>(undefined);

  useEffect(() => {
    if (esperando) return;
    if (cache.current === undefined || cache.current.llave !== layout) cache.current = { llave: layout, mapa: new Map() };
    const mapa = cache.current.mapa;
    const clave = claveBase;
    const mostrar = (geometria: Geometria): void => {
      const nuevo = { vista, geometria };
      ultimo.current.alLlegar?.(mostrado.current, nuevo);
      mostrado.current = nuevo;
      setCalculo(nuevo);
    };

    const tema = ultimo.current.theme;
    const recibir = (base: Geometria): void => {
      mapa.delete(clave);
      mapa.set(clave, base);
      if (mapa.size > MAX_CACHE) mapa.delete(mapa.keys().next().value!);
      mostrar(aplicarPinsAGeometria(vista, base, tema, tabla));
    };

    let vigente = true;
    const base = mapa.get(clave);
    if (base !== undefined) {
      recibir(base);
    } else if (semilla !== undefined && medidas === undefined && claveDeLayout(semilla.vista, theme) === claveTema) {
      mostrar(semilla.geometria);
    } else {
      layout(sinPins(vista), tema, medidas).then(
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
  }, [vista, claveTema, layout, semilla, esperando]);

  if (fallo !== undefined) throw fallo;
  return calculo;
}

/** La Vista sin Pins: lo que se le pide al adaptador, que solo calcula la parte de ELK. */
function sinPins(vista: VistaResuelta): VistaResuelta {
  if (vista.overrides.every((o) => o.pin === undefined)) return vista;
  return { ...vista, overrides: vista.overrides.map(({ pin: _pin, ...resto }) => resto) };
}
