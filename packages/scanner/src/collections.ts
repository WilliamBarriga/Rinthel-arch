/** Small collection helpers every part of the scan shares. */

/**
 * Orders strings by UTF-16 code unit, independent of locale: the one order of every sorted array in the draft (and of
 * whatever a consumer derives from it), so the same files always give the same bytes.
 */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Items by `key(item)`, each group in input order; groups in first-seen order. */
export function groupBy<T>(items: Iterable<T>, key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group === undefined) groups.set(k, [item]);
    else group.push(item);
  }
  return groups;
}
