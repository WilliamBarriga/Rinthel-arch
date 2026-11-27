function levenshteinDistance(a: string, b: string): number {
  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previousRow[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previousRow[j - 1] as number) + cost,
      );
    }
    previousRow = current;
  }
  return previousRow[b.length] as number;
}

/**
 * Names in `existing` within Levenshtein distance <= max(1, len(written)/3), sorted.
 * A single result is an unambiguous candidate (`fix`); several are ambiguous (`hint`).
 */
export function nearestCandidates(written: string, existing: Iterable<string>): string[] {
  const max = Math.max(1, Math.floor(written.length / 3));
  return [...existing].filter((name) => levenshteinDistance(written, name) <= max).sort();
}
