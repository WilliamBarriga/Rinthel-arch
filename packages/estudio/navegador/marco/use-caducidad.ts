/**
 * Temporizador de caducidad: con `ms` definido llama `alVencer` tras `ms`; cambiar `clave` (o `ms`) lo reinicia y
 * `ms === undefined` lo cancela. Lo usan los avisos del marco, las marcas del disco y el resaltado de la Diferencia.
 * `alVencer` puede cambiar en cada render sin reiniciar la cuenta.
 */
import { useEffect, useRef } from 'react';

export function useCaducidad(ms: number | undefined, alVencer: () => void, clave?: unknown): void {
  const vencer = useRef(alVencer);
  vencer.current = alVencer;
  useEffect(() => {
    if (ms === undefined) return;
    const t = setTimeout(() => vencer.current(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [ms, clave]);
}
