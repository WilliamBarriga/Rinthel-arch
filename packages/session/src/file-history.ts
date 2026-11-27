/**
 * File history of `dev` (ADR 0007, "History versus external writes"): each entry stores the text before and after
 * of each file that changed. Undo or redo writes only those files and is rejected with `stale-hash` if any of them
 * changed outside (the `seen` rule); an external write to another file neither invalidates nor resets it. Pure and
 * immutable: its user writes `written` to disk.
 * Jump (#193): `jump` takes the disk to any entry (or to `DEV_HISTORY_START`) composing undo or redo with the same
 * rejection rule; it does not push and keeps the future. Each entry carries an increasing `id` that is never reused.
 */
import { DEV_HISTORY_START } from 'canonical';
import type { DevHistoryEntry, DevHistory, Intent } from 'canonical';
import type { ArchivosDelWorkspace } from 'dsl';

/** `undefined`: the file did not exist (before) or was removed (after). */
export interface FileChange {
  readonly before: string | undefined;
  readonly after: string | undefined;
}

export interface HistoryEntry {
  /** Counter stable while the history lives (the `dev` process); starts at 1. */
  readonly id: number;
  /** Time of the record in ms (set by the recorder: `session` has no clock). */
  readonly at: number;
  /** Built by the recorder: from the Intent, the request's `descripcion` or "text of `<file>`". */
  readonly description: string;
  readonly changes: Readonly<Record<string, FileChange>>;
}

/** `past` from the oldest entry to the most recent; `future` starts with the next one to redo. */
export interface FileHistory {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
  /** `id` of the next entry. */
  readonly next: number;
}

export const emptyFileHistory: FileHistory = { past: [], future: [], next: 1 };


export type RestoreResult =
  | { ok: true; history: FileHistory; files: ArchivosDelWorkspace; written: string[] }
  | { ok: false; reason: 'nothing-to-undo' | 'nothing-to-redo' | 'stale-hash' | 'unknown-entry'; message: string; file?: string };

/** Description of an Intent's entry. */
export function intentDescription(intent: Intent): string {
  switch (intent.type) {
    case 'move-pin':
      return `move ${intent.node} in ${intent.view}`;
    case 'reorder-lifelines':
      return `reorder Lifelines of ${intent.view}`;
    case 'set-theme':
      return intent.theme === undefined ? `unpin the Theme of ${intent.view}` : `pin the Theme ${intent.theme} to ${intent.view}`;
  }
}

/** Description of a text save without its own `descripcion`. */
export const textDescription = (files: readonly string[]): string => `text of ${files.join(', ')}`;

const changedPaths = (before: ArchivosDelWorkspace, after: ArchivosDelWorkspace): string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((r) => before[r] !== after[r]).sort();

/** Pushes what changed from `before` to `after` and drops the future; without changes it returns the same history. */
export function record(history: FileHistory, description: string, before: ArchivosDelWorkspace, after: ArchivosDelWorkspace, at = 0): FileHistory {
  const paths = changedPaths(before, after);
  if (paths.length === 0) return history;
  const changes = Object.fromEntries(paths.map((r) => [r, { before: before[r], after: after[r] }]));
  return { past: [...history.past, { id: history.next, at, description, changes }], future: [], next: history.next + 1 };
}

/** Takes each file of the entry from `from` to `to`, if the disk is still at `from`. */
function move(entry: HistoryEntry, disk: ArchivosDelWorkspace, direction: 'undo' | 'redo'): { ok: true; files: ArchivosDelWorkspace; written: string[] } | { ok: false; file: string } {
  const files: Record<string, string> = { ...disk };
  const written = Object.keys(entry.changes).sort();
  for (const path of written) {
    const change = entry.changes[path] as FileChange;
    const [from, to] = direction === 'undo' ? [change.after, change.before] : [change.before, change.after];
    if (disk[path] !== from) return { ok: false, file: path };
    if (to === undefined) delete files[path];
    else files[path] = to;
  }
  return { ok: true, files, written };
}

const changedOutside = (file: string) => ({ ok: false, reason: 'stale-hash', message: `'${file}' changed outside dev; this entry cannot be restored`, file }) as const;

export function undoOn(history: FileHistory, disk: ArchivosDelWorkspace): RestoreResult {
  const entry = history.past[history.past.length - 1];
  if (entry === undefined) return { ok: false, reason: 'nothing-to-undo', message: 'Nothing to undo' };
  const r = move(entry, disk, 'undo');
  if (!r.ok) return changedOutside(r.file);
  return { ...r, history: { ...history, past: history.past.slice(0, -1), future: [entry, ...history.future] } };
}

export function redoOn(history: FileHistory, disk: ArchivosDelWorkspace): RestoreResult {
  const [entry, ...rest] = history.future;
  if (entry === undefined) return { ok: false, reason: 'nothing-to-redo', message: 'Nothing to redo' };
  const r = move(entry, disk, 'redo');
  if (!r.ok) return changedOutside(r.file);
  return { ...r, history: { ...history, past: [...history.past, entry], future: rest } };
}

/**
 * Takes the disk to entry `id`: from the past, to the state right after it; from the future, redoing up to it;
 * `DEV_HISTORY_START`, to the text before the first one. `written` are only the files that differ from the disk.
 */
export function jump(history: FileHistory, disk: ArchivosDelWorkspace, id: number): RestoreResult {
  const backwards = id === DEV_HISTORY_START || history.past.some((e) => e.id === id);
  if (!backwards && !history.future.some((e) => e.id === id)) return { ok: false, reason: 'unknown-entry', message: `There is no entry ${id} in the History` };
  const reached = (h: FileHistory): boolean => (id === DEV_HISTORY_START ? h.past.length === 0 : h.past[h.past.length - 1]?.id === id);
  let h = history;
  let files = disk;
  while (!reached(h)) {
    const r = backwards ? undoOn(h, files) : redoOn(h, files);
    if (!r.ok) return r;
    h = r.history;
    files = r.files;
  }
  return { ok: true, history: h, files, written: changedPaths(disk, files) };
}

/**
 * The File history as the UI sees it (`DevHistory` from `canonical`): each target is reachable if `jump` to it is
 * not rejected over `disk` (the undo rule); `reason` only if it is not.
 */
export function visibleHistory(history: FileHistory, disk: ArchivosDelWorkspace): DevHistory {
  const reach = (id: number): DevHistory['inicio'] => {
    const r = jump(history, disk, id);
    return r.ok ? { alcanzable: true } : { alcanzable: false, reason: r.message };
  };
  const visible = ({ id, description, at, changes }: HistoryEntry): DevHistoryEntry => ({ id, descripcion: description, archivos: Object.keys(changes), cuando: at, ...reach(id) });
  return { pasado: history.past.map(visible), futuro: history.future.map(visible), inicio: reach(DEV_HISTORY_START) };
}
