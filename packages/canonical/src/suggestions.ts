function levenshteinDistance(a: string, b: string): number {
  let previousOne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previousOne[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previousOne[j - 1] as number) + cost,
      );
    }
    previousOne = current;
  }
  return previousOne[b.length] as number;
}

/**
 * Names in `existing` within Levenshtein distance <= max(1, len(written)/3), sorted.
 * A single result is an unambiguous candidate (`fix`); several are ambiguous (`hint`).
 */
export function nearestCandidates(written: string, existing: Iterable<string>): string[] {
  const max = Math.max(1, Math.floor(written.length / 3));
  return [...existing].filter((name) => levenshteinDistance(written, name) <= max).sort();
}
