/** Reloj inyectado del Workspace vivo y del Registro de actividad vivo (el nucleo no tiene reloj propio). `programar` devuelve como cancelar. */
export interface Reloj {
  programar(fn: () => void, ms: number): () => void;
}

/** Una sola tarea pendiente sobre un `Reloj`: programar otra cancela la anterior. */
export interface Debounce {
  /** Corre `fn` tras `ms` sin otra llamada en medio. */
  programar(fn: () => void): void;
  /** Cancela la pendiente, si la hay. */
  cancelar(): void;
}

export function debounce(reloj: Reloj, ms: number): Debounce {
  let cancelarPendiente: (() => void) | undefined;
  const cancelar = (): void => {
    cancelarPendiente?.();
    cancelarPendiente = undefined;
  };
  return {
    programar(fn) {
      cancelar();
      cancelarPendiente = reloj.programar(() => {
        cancelarPendiente = undefined;
        fn();
      }, ms);
    },
    cancelar,
  };
}
