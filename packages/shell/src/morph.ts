/**
 * Animacion del morph entre dos geometrias (ADR 0003). El reloj es el de
 * `requestAnimationFrame`; sin el, o con duracion 0, no hay animacion.
 */
import { useCallback, useEffect, useState } from 'react';

import type { Geometria } from 'layout';

export interface Morph {
  desde: Geometria;
  hasta: Geometria;
  /** Grupo tocado, que se mantiene fijo en pantalla. */
  ancla: string;
}

const suavizado = (t: number): number => t * t * (3 - 2 * t);

/** Devuelve el morph en curso con su progreso `t` en 0..1 (ya suavizado), `iniciar` y `cancelar`. */
export function useMorph(duracionMs: number): {
  morph: (Morph & { t: number }) | undefined;
  iniciar: (morph: Morph) => void;
  cancelar: () => void;
} {
  const [activo, setActivo] = useState<Morph>();
  const [t, setT] = useState(0);
  const iniciar = useCallback(
    (morph: Morph) => {
      if (duracionMs <= 0 || typeof requestAnimationFrame !== 'function') return;
      setT(0);
      setActivo(morph);
    },
    [duracionMs],
  );
  const cancelar = useCallback(() => setActivo(undefined), []);

  useEffect(() => {
    if (activo === undefined) return;
    let inicio: number | undefined;
    let cuadro = 0;
    const paso = (ahora: number): void => {
      inicio ??= ahora;
      const lineal = Math.min(1, (ahora - inicio) / duracionMs);
      if (lineal >= 1) {
        setActivo(undefined);
        return;
      }
      setT(suavizado(lineal));
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [activo, duracionMs]);

  return { morph: activo === undefined ? undefined : { ...activo, t }, iniciar, cancelar };
}
