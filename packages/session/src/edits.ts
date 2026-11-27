import { contentHash } from 'canonical';
import type { Issue, RejectionReason, TextPosition, TextRange } from 'canonical';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace } from 'dsl';

/** Lives in `canonical` (pure, the browser editor uses it too); re-exported for compatibility. */
export { contentHash };

export interface HashedEdit {
  file: string;
  /** 1-based range, end excluded (the same as `IssueFix`). */
  range: TextRange;
  replacement: string;
  /** `contentHash` of the file as the caller saw it. */
  hash: string;
  /** New path of `file` (a file or folder): a rename, applied by `applyToWorkspace`, not by the text functions. */
  rename?: string;
}

/** With `ok: false` nothing is written. */
export type EditResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: RejectionReason; message: string; file?: string };

export const reject = (reason: RejectionReason, message: string, file?: string) =>
  ({ ok: false, reason, message, ...(file === undefined ? {} : { file }) }) as const;

/** Offset of a 1-based position; `undefined` if it falls outside the text. */
export function offsetOf(text: string, { line, column }: TextPosition): number | undefined {
  let start = 0;
  for (let n = 1; n < line; n++) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) return undefined;
    start = newline + 1;
  }
  const offset = start + column - 1;
  const lineEnd = text.indexOf('\n', start);
  const limit = lineEnd === -1 ? text.length : lineEnd;
  return column >= 1 && offset <= limit ? offset : undefined;
}

/** An error is the same one if it shares code and file, even if its message or line changes. */
const key = (issue: Issue) => `${issue.code}|${issue.file}`;

/** Pre-existing errors do not block an unrelated edit. */
export const errorsByKey = (issues: readonly Issue[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const i of issues) if (i.severity === 'error') counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return counts;
};

/**
 * Returns the new map without mutating the input. All or nothing: rejects if a hash does not match, a range is invalid,
 * two edits overlap or the result has more errors per code and file than `errorsBefore`.
 * The `issues` are those of the resulting Workspace.
 */
export function applyAgainst(
  files: ArchivosDelWorkspace,
  edits: readonly HashedEdit[],
  errorsBefore: Map<string, number>,
): EditResult<{ files: ArchivosDelWorkspace; issues: Issue[] }> {
  const r = replaceText(files, edits);
  if (!r.ok) return r;
  const result = r.files;
  const after = compile(result).issues;
  const counts = new Map(errorsBefore);
  const introduced = after.find((i) => {
    if (i.severity !== 'error') return false;
    const remaining = counts.get(key(i)) ?? 0;
    counts.set(key(i), remaining - 1);
    return remaining <= 0;
  });
  if (introduced !== undefined) return reject('invalid', `The edit introduces an error: ${introduced.message}`, introduced.file);
  return { ok: true, files: result, issues: after };
}

/**
 * Like `applyAgainst` but without the error self-test: rejects only on file, hash, range or overlap. It is the one of
 * editor saves, which are written even if they do not compile (ADR 0007).
 */
export function replaceText(files: ArchivosDelWorkspace, edits: readonly HashedEdit[]): EditResult<{ files: ArchivosDelWorkspace }> {
  const byFile = new Map<string, { start: number; end: number; text: string }[]>();
  for (const { file, range, replacement, hash } of edits) {
    const current = files[file];
    if (current === undefined) return reject('unknown-file', `File '${file}' does not exist`, file);
    if (hash !== contentHash(current)) {
      return reject('stale-hash', `File '${file}' changed since it was read`, file);
    }
    const start = offsetOf(current, range.start);
    const end = offsetOf(current, range.end);
    if (start === undefined || end === undefined || end < start) {
      return reject('invalid-range', `Range outside file '${file}'`, file);
    }
    byFile.set(file, [...(byFile.get(file) ?? []), { start, end, text: replacement }]);
  }

  const result: Record<string, string> = { ...files };
  for (const [file, list] of byFile) {
    const order = [...list].sort((a, b) => b.start - a.start || b.end - a.end);
    let text = files[file] as string;
    let limit = Infinity;
    for (const { start, end, text: inserted } of order) {
      if (end > limit) return reject('overlapping-edits', `Overlapping edits in '${file}'`, file);
      text = text.slice(0, start) + inserted + text.slice(end);
      limit = start;
    }
    result[file] = text;
  }
  return { ok: true, files: result };
}

/** `applyAgainst` counting the previous errors of the map itself. */
export function applyEdits(
  files: ArchivosDelWorkspace,
  edits: readonly HashedEdit[],
): EditResult<{ files: ArchivosDelWorkspace; issues: Issue[] }> {
  return applyAgainst(files, edits, errorsByKey(compile(files).issues));
}
