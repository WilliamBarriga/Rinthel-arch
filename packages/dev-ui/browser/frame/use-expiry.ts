/**
 * Expiry timer: with `ms` defined it calls `onExpire` after `ms`; changing `key` (or `ms`) restarts it and
 * `ms === undefined` cancels it. Used by the frame notices, the disk marks and the Diff highlight.
 * `onExpire` may change on every render without restarting the count.
 */
import { useEffect, useRef } from 'react';

export function useExpiry(ms: number | undefined, onExpire: () => void, key?: unknown): void {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    if (ms === undefined) return;
    const t = setTimeout(() => expire.current(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [ms, key]);
}
