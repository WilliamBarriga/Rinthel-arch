/** Clock injected into the Live workspace and the live Activity log (the core has no clock of its own). `schedule` returns how to cancel. */
export interface Clock {
  schedule(fn: () => void, ms: number): () => void;
}

/** A single pending task over a `Clock`: scheduling another one cancels the previous one. */
export interface Debounce {
  /** Runs `fn` after `ms` with no other call in between. */
  schedule(fn: () => void): void;
  /** Cancels the pending one, if any. */
  cancel(): void;
}

export function debounce(clock: Clock, ms: number): Debounce {
  let cancelPending: (() => void) | undefined;
  const cancel = (): void => {
    cancelPending?.();
    cancelPending = undefined;
  };
  return {
    schedule(fn) {
      cancel();
      cancelPending = clock.schedule(() => {
        cancelPending = undefined;
        fn();
      }, ms);
    },
    cancel,
  };
}
