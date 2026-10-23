/**
 * Mecanismo unico de props controlados: un valor que gobierna el padre cuando
 * lo da (controlado) o que guarda el componente cuando no (no controlado). Los
 * avisos al padre salen siempre, en ambos modos.
 */
import { useReducer, useRef, useState } from 'react';

/**
 * Devuelve `[vigente, fijar]`. `vigente` es `controlado` si el padre lo da; si no, el valor propio
 * (`inicial` hasta el primer `fijar`). `fijar(nuevo)` guarda el valor propio solo en modo no
 * controlado, llama `alCambiar` en ambos y, en modo controlado, re-renderiza para que quien
 * depende del valor reconcilie un cambio que el padre ignoro.
 */
export function useControlado<T>(
  controlado: T | undefined,
  inicial: T,
  alCambiar?: ((valor: T) => void) | undefined,
): [T, (valor: T) => void] {
  const [propio, setPropio] = useState<T>(inicial);
  const [, reconciliar] = useReducer((n: number) => n + 1, 0);
  const aviso = useRef(alCambiar);
  aviso.current = alCambiar;
  const esControlado = useRef(false);
  esControlado.current = controlado !== undefined;
  const fijar = (valor: T): void => {
    // Lee refs, no el cierre: sirve desde efectos y callbacks que capturaron un `fijar` anterior.
    if (esControlado.current) reconciliar();
    else setPropio(valor);
    aviso.current?.(valor);
  };
  return [controlado ?? propio, fijar];
}
