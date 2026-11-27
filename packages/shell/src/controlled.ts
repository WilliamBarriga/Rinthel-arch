import { useReducer, useRef, useState } from 'react';

/**
 * Returns `[current, set]`. `current` is `controlled` if the parent gives it; otherwise the own value
 * (`initial` until the first `set`). `set(next)` stores the own value only in uncontrolled
 * mode, calls `onChange` in both and, in controlled mode, re-renders so whoever
 * depends on the value reconciles a change the parent ignored.
 */
export function useControlled<T>(
  controlled: T | undefined,
  initial: T,
  handleChange?: ((value: T) => void) | undefined,
): [T, (value: T) => void] {
  const [ownValue, setOwnValue] = useState<T>(initial);
  const [, reconcileState] = useReducer((n: number) => n + 1, 0);
  const notice = useRef(handleChange);
  notice.current = handleChange;
  const isControlled = useRef(false);
  isControlled.current = controlled !== undefined;
  const set = (value: T): void => {
    // Reads refs, not the closure: it works from effects and callbacks that captured an earlier `set`.
    if (isControlled.current) reconcileState();
    else setOwnValue(value);
    notice.current?.(value);
  };
  return [controlled ?? ownValue, set];
}
