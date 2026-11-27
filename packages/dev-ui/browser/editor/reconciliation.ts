/**
 * Reconciliation of the editor buffer with the disk (external writes: the agent, a `fix`, another editor). Pure, no
 * DOM: it works with CodeMirror `ChangeSet`s so the editor dispatches them as is and maps cursor, selection and scroll.
 * - `minimalDiff(before, after)`: line diff (Myers) refined to characters inside each stretch.
 * - `threeWayMerge(base, disk, buffer)`: merges what the disk changed and what the user typed since `base`. If a
 *   buffer stretch overlaps a disk one, the disk wins and the buffer stretch (its whole lines) goes to `lost` so it can
 *   be offered for recovery. Overlap is by lines, like `git merge`: two stretches that touch the same base line, or
 *   two blocks of lines inserted at the same edge; neighbouring lines do not.
 */
import { ChangeSet, Text } from '@codemirror/state';
import type { ChangeSpec } from '@codemirror/state';

/** Lines with their final break, so that the last line without `\n` differs from the same one with `\n`. */
const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+/g) ?? [];

/** Pairs `[i, j]` of equal lines of a longest common subsequence (Myers, O((N+M)D)). */
function commonLines(a: readonly string[], b: readonly string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  let end = -1;
  for (let d = 0; d <= max && end < 0; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const lower = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let x = lower ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        end = d;
        break;
      }
    }
  }
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = end; d > 0; d--) {
    const previous = trace[d] as Map<number, number>;
    const k = x - y;
    const lower = k === -d || (k !== d && (previous.get(k - 1) ?? -1) < (previous.get(k + 1) ?? -1));
    const previousK = lower ? k + 1 : k - 1;
    const previousX = previous.get(previousK) ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      pairs.push([x, y]);
    }
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    pairs.push([x, y]);
  }
  return pairs.reverse();
}

/** Minimal changes that take `before` to `after`. */
export function minimalDiff(before: string, after: string): ChangeSet {
  if (before === after) return ChangeSet.empty(before.length);
  const a = linesOf(before);
  const b = linesOf(after);
  const offsetsA = [0];
  for (const l of a) offsetsA.push((offsetsA.at(-1) as number) + l.length);
  const offsetsB = [0];
  for (const l of b) offsetsB.push((offsetsB.at(-1) as number) + l.length);
  const changes: ChangeSpec[] = [];
  let i = 0;
  let j = 0;
  for (const [ci, cj] of [...commonLines(a, b), [a.length, b.length] as [number, number]]) {
    if (ci > i || cj > j) {
      const from = offsetsA[i] as number;
      const to = offsetsA[ci] as number;
      const old = before.slice(from, to);
      const fresh = after.slice(offsetsB[j], offsetsB[cj]);
      let prefix = 0;
      while (prefix < old.length && prefix < fresh.length && old[prefix] === fresh[prefix]) prefix++;
      let suffix = 0;
      while (suffix < old.length - prefix && suffix < fresh.length - prefix && old[old.length - 1 - suffix] === fresh[fresh.length - 1 - suffix]) suffix++;
      changes.push({ from: from + prefix, to: to - suffix, insert: fresh.slice(prefix, fresh.length - suffix) });
    }
    i = ci + 1;
    j = cj + 1;
  }
  return ChangeSet.of(changes, before.length);
}

/**
 * What the buffer had in a stretch the disk won: its whole lines, the line (1-based) where it falls in `text` and how
 * many lines of `text` (from `line`) are the disk version of that stretch; 0 if the buffer only inserted lines.
 * Recovering it means putting `text` in place of those `replaces` lines.
 */
export interface LostFragment {
  text: string;
  line: number;
  replaces: number;
}

export interface Merge {
  /** Merged text. */
  text: string;
  /** Changes that take the buffer to `text` (dispatched annotated with `fromDisk`). */
  toBuffer: ChangeSet;
  /** Pending keystrokes rebased onto the disk: they take `disk` to `text` (what is left to save). */
  pending: ChangeSet;
  lost: LostFragment[];
}

interface Stretch {
  from: number;
  to: number;
  fromB: number;
  toB: number;
  inserts: string;
}

const stretchesOf = (changes: ChangeSet): Stretch[] => {
  const stretches: Stretch[] = [];
  changes.iterChanges((from, to, fromB, toB, inserts) => stretches.push({ from, to, fromB, toB, inserts: inserts.toString() }));
  return stretches;
};

/**
 * Base lines a stretch touches, as a closed interval: `2n` is the content of line `n` and `2n - 1` the edge before it
 * (where inserted whole lines fall). Two stretches overlap if their intervals intersect.
 */
const touchedLines = (t: Stretch, base: Text): [number, number] => {
  const line = (pos: number): number => base.lineAt(pos).number;
  if (t.from === t.to) {
    const border = base.lineAt(t.from).from === t.from && t.inserts.endsWith('\n');
    return border ? [2 * line(t.from) - 1, 2 * line(t.from) - 1] : [2 * line(t.from), 2 * line(t.from)];
  }
  const end = base.lineAt(t.to).from === t.to ? t.to - 1 : t.to;
  return [2 * line(t.from), 2 * line(end)];
};

const doc = (text: string): Text => Text.of(text.split('\n'));

export function threeWayMerge(base: string, disk: string, buffer: string): Merge {
  const fromDisk = minimalDiff(base, disk);
  const diskStretches = stretchesOf(fromDisk);
  const fromBuffer = stretchesOf(minimalDiff(base, buffer));
  const baseDoc = doc(base);
  const occupied = diskStretches.map((d) => touchedLines(d, baseDoc));
  const kept = fromBuffer.filter((t) => {
    const [from, to] = touchedLines(t, baseDoc);
    return !occupied.some(([d, h]) => from <= h && d <= to);
  });
  const pending = ChangeSet.of(
    kept.map((t) => ({ from: t.from, to: t.to, insert: t.inserts })),
    base.length,
  ).map(fromDisk);
  const merged = pending.apply(doc(disk));
  const text = merged.toString();
  const bufferDoc = doc(buffer);
  const lost = fromBuffer
    .filter((t) => !kept.includes(t))
    .map((t): LostFragment => {
      const first = bufferDoc.lineAt(t.fromB);
      const last = bufferDoc.lineAt(t.toB > t.fromB && bufferDoc.lineAt(t.toB).from === t.toB ? t.toB - 1 : t.toB);
      const inMerged = pending.mapPos(fromDisk.mapPos(t.from, -1), -1);
      const line = merged.lineAt(inMerged).number;
      const [from, to] = touchedLines(t, baseDoc);
      // An odd interval is an edge between lines: the buffer only inserted whole lines, there is no disk version to remove.
      if (from % 2 === 1) return { text: bufferDoc.sliceString(first.from, last.to), line, replaces: 0 };
      const endInBase = baseDoc.line(to / 2).to;
      const endInMerged = pending.mapPos(fromDisk.mapPos(endInBase, 1), 1);
      return { text: bufferDoc.sliceString(first.from, last.to), line, replaces: merged.lineAt(endInMerged).number - line + 1 };
    });
  return { text, toBuffer: minimalDiff(buffer, text), pending, lost };
}
