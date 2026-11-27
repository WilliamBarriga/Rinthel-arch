import type { RejectionReason } from 'canonical';
import type { ArchivosDelWorkspace } from 'dsl';

import { applyEdits, contentHash, replaceText } from './edits';
import type { HashedEdit } from './edits';
import { applyIntent } from './intents';
import type { Intent, Seen } from './intents';

/**
 * `read` gives `disk` (the Workspace plus the Themes of `--theme-path`, what gets compiled) and `own` (the only
 * writable files). I/O failures propagate as exceptions.
 */
export interface WorkspacePort {
  read(): { disk: ArchivosDelWorkspace; own: ArchivosDelWorkspace };
  write(path: string, text: string): void;
  /**
   * Renames a Workspace path (file or folder, `/`-separated) for an edit with `rename` (the `fix` of
   * `old-workspace-convention`). Without it (and `exists`), such an edit is rejected with `invalid-rename`.
   */
  renamePath?(oldPath: string, newPath: string): void;
  /** Whether a Workspace path (file or folder) exists. */
  exists?(path: string): boolean;
}

/**
 * Text edit `{ file, range, replacement }` with an optional `hash`: without it, concurrency is decided by `seen[file]`
 * (the `version` the UI saw, translated to hashes) and, without either, it applies over the current text.
 */
export type TextEdit = Omit<HashedEdit, 'hash'> & { hash?: string };

export type Applicable = Intent | readonly TextEdit[];

export interface ApplyOptions {
  /**
   * Only for edit lists: writes even if the result has new errors (editor save, ADR 0007).
   * Defaults to `false`: an edit that introduces an error is rejected with `invalid` (`edit --edits`, `fix`).
   */
  evenIfBroken?: boolean;
}

export type ApplyResult =
  | { ok: true; changed: string[]; edits: HashedEdit[]; renamed: RenamedPath[] }
  | { ok: false; reason: RejectionReason; message: string; file?: string };

/** A path renamed by an edit: `file` is the old path, `rename` the new one. */
export interface RenamedPath {
  file: string;
  rename: string;
}

type Rejection = Extract<ApplyResult, { ok: false }>;

const invalidRename = (message: string, file?: string): Rejection => ({ ok: false, reason: 'invalid-rename', message, ...(file === undefined ? {} : { file }) });
const isWithin = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);
const isValidPath = (path: string): boolean => path !== '' && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');

/** Checks every rename before anything is written: the whole batch is rejected if one is impossible. */
function checkRenames(port: WorkspacePort, renames: readonly RenamedPath[]): Rejection | undefined {
  const { renamePath, exists } = port;
  if (renamePath === undefined || exists === undefined) return invalidRename('This writer cannot rename files; rename the path by hand');
  for (const [i, { file, rename }] of renames.entries()) {
    if (!isValidPath(file) || !isValidPath(rename)) return invalidRename(`Cannot rename '${file}' to '${rename}': both must be relative paths inside the Workspace`, file);
    if (!exists(file)) return { ok: false, reason: 'unknown-file', message: `'${file}' does not exist`, file };
    if (exists(rename)) return invalidRename(`Cannot rename '${file}' to '${rename}': '${rename}' already exists`, file);
    const other = renames.find((r, j) => j !== i && (isWithin(r.file, file) || isWithin(file, r.file) || r.rename === rename));
    if (other !== undefined) return invalidRename(`Renames of '${file}' and '${other.file}' overlap; apply them one at a time`, file);
  }
  return undefined;
}

/** Applies the checked renames in order; if one fails, undoes the previous ones and rethrows. */
function renameAll(port: WorkspacePort, renames: readonly RenamedPath[]): void {
  const done: RenamedPath[] = [];
  try {
    for (const r of renames) {
      port.renamePath?.(r.file, r.rename);
      done.push(r);
    }
  } catch (error) {
    for (const r of done.reverse()) port.renamePath?.(r.rename, r.file);
    throw error;
  }
}

const changedBetween = (before: ArchivosDelWorkspace, after: ArchivosDelWorkspace): string[] =>
  Object.keys(after)
    .filter((f) => after[f] !== before[f])
    .sort();

/**
 * Single write door: reads fresh through the port, applies an Intent or text edits (both with `seen`; an edit with
 * its own `hash` uses it before `seen`) and writes only the own files that change. All or nothing.
 * Changing a foreign file (e.g. from `--theme-path`) rejects with `unknown-file`. The port's I/O failures propagate.
 */
export function applyToWorkspace(port: WorkspacePort, applicable: Applicable, seen?: Seen, options: ApplyOptions = {}): ApplyResult {
  const { disk, own } = port.read();
  let r;
  let renamed: RenamedPath[] = [];
  if (isEditList(applicable)) {
    // A `rename` edit renames a path after the text edits are written (their paths are the old ones); its range and
    // replacement are an empty edit, so it takes no part in the text.
    renamed = applicable.flatMap((e) => (e.rename === undefined ? [] : [{ file: e.file, rename: e.rename }]));
    const rejection = renamed.length === 0 ? undefined : checkRenames(port, renamed);
    if (rejection !== undefined) return rejection;
    const edits = applicable.map((e) => ({ ...e, hash: e.hash ?? seen?.[e.file] ?? contentHash(disk[e.file] ?? '') }));
    const textEdits = edits.filter((e) => e.rename === undefined);
    const applied = textEdits.length === 0 ? { ok: true as const, files: disk } : options.evenIfBroken === true ? replaceText(disk, textEdits) : applyEdits(disk, textEdits);
    r = { ...applied, edits };
  } else {
    r = applyIntent(disk, applicable, seen);
  }
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message, ...(r.file === undefined ? {} : { file: r.file }) };
  const changed = changedBetween(disk, r.files);
  const foreign = changed.find((f) => !(f in own));
  if (foreign !== undefined) {
    return { ok: false, reason: 'unknown-file', message: `'${foreign}' does not belong to the Workspace`, file: foreign };
  }
  for (const path of changed) port.write(path, r.files[path] as string);
  renameAll(port, renamed);
  return { ok: true, changed, edits: r.edits, renamed };
}

const isEditList = (applicable: Applicable): applicable is readonly TextEdit[] => Array.isArray(applicable);
