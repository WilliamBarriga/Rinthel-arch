/** Gestures: each Intent reduces to what to locate and what text to write. Internal: the entry point is `applyIntent`. */
import { nearestCandidates } from 'canonical';
import type { CanonicalForm, OrderIntent, PinIntent, ThemeIntent, Issue, TextRange, Locator } from 'canonical';
import { compile } from 'dsl';
import type { WorkspaceFiles } from 'dsl';

import { applyAgainst, errorsByKey, contentHash, offsetOf, reject } from './edits';
import type { HashedEdit, EditResult } from './edits';

export type GestureResult = EditResult<{
  files: WorkspaceFiles;
  edits: HashedEdit[];
  issues: Issue[];
}>;

/** File -> `contentHash` of the text seen by whoever sends the Intent. A file without an entry applies over the current text. */
export type Seen = Readonly<Record<string, string>>;

type Rejection = Extract<GestureResult, { ok: false }>;

/**
 * `replace` a range `by` a text; `insert` a statement at the empty site `at` (before a closing brace): on its own
 * line if that brace is alone, on the same line otherwise; or insert it at the empty site `after` an opening brace:
 * as the first line of the block if the brace ends its line, on the same line otherwise.
 */
type TextWrite = { file: string } & ({ replace: TextRange; by: string } | { at: TextRange; insert: string } | { after: TextRange; insert: string });

interface GestureContext {
  source: CanonicalForm;
  declared: CanonicalForm['views'][number];
  index: number;
  locate: Locator;
  text: (file: string) => string;
}

function toEdit(write: TextWrite, text: string): HashedEdit {
  const { file } = write;
  const hash = contentHash(text);
  if ('replace' in write) return { file, range: write.replace, replacement: write.by, hash };
  if ('after' in write) {
    const { after, insert } = write;
    const line = text.split('\n')[after.start.line - 1] ?? '';
    const rest = line.slice(after.start.column - 1);
    const point = { start: after.start, end: after.start };
    if (rest.trim() === '') return { file, range: point, replacement: `\n${/^\s*/.exec(line)?.[0] ?? ''}  ${insert}`, hash };
    return { file, range: point, replacement: ` ${insert}${/^\s/.test(rest) ? '' : ' '}`, hash };
  }
  const { at, insert } = write;
  const line = text.split('\n')[at.start.line - 1] ?? '';
  const previous = line.slice(0, at.start.column - 1);
  if (previous.trim() === '') {
    const start = { line: at.start.line, column: 1 };
    return { file, range: { start, end: start }, replacement: `${previous}  ${insert}\n`, hash };
  }
  return { file, range: at, replacement: `${/\s$/.test(previous) ? '' : ' '}${insert} `, hash };
}

/** Checks `seen` against the touched file and self-tests the edit (all or nothing); 2 compilations in total. */
function runGesture(
  files: WorkspaceFiles,
  view: string,
  seen: Seen | undefined,
  describeWrite: (context: GestureContext) => TextWrite | Rejection,
): GestureResult {
  const compiled = compile(files);
  const { canonical: source, locate } = compiled;
  if (source === undefined || locate === undefined) {
    const first = compiled.issues.find((i) => i.severity === 'error');
    return reject('invalid', `The Workspace has errors: ${first?.message ?? ''}`, first?.file);
  }
  const index = source.views.findIndex(({ id }) => id === view);
  const declared = source.views[index];
  if (declared === undefined) return reject('unknown-view', `View '${view}' does not exist`);

  const text = (file: string) => files[file] as string;
  const write = describeWrite({ source, declared, index, locate, text });
  if ('ok' in write) return write;
  const { file } = write;
  const seenHash = seen?.[file];
  if (seenHash !== undefined && seenHash !== contentHash(text(file))) {
    return reject('stale-hash', `File '${file}' changed since it was read`, file);
  }
  const edit = toEdit(write, text(file));
  const applied = applyAgainst(files, [edit], errorsByKey(compiled.issues));
  if (!applied.ok) return applied;
  return { ok: true, files: applied.files, edits: [edit], issues: applied.issues };
}

/** Pin coordinates are written as integers in [-PIN_LIMIT, PIN_LIMIT]. */
const PIN_LIMIT = 100_000;
const pinCoordinate = (n: number): number => Math.min(PIN_LIMIT, Math.max(-PIN_LIMIT, Math.round(n))) + 0;

/**
 * Replaces the `pin` of the Node's override, adds it to an override without `pin`, or inserts `node <id> { pin x,y }`
 * before the View's `}`. A missing Node rejects with `invalid`.
 */
export function movePin(files: WorkspaceFiles, intent: PinIntent, seen?: Seen): GestureResult {
  const { node } = intent;
  const pin = `pin ${pinCoordinate(intent.x)},${pinCoordinate(intent.y)}`;
  return runGesture(files, intent.view, seen, ({ declared, index, locate, text }) => {
    const j = declared.overrides.findIndex((o) => o.node === node);
    const site = j >= 0 ? locate(['views', index, 'overrides', j, 'pin']) : locate(['views', index, 'overrides']);
    if (site === null) return reject('invalid', `Could not find where to write the Pin of '${node}'`);
    const { file, range } = site;
    const empty = range.start.line === range.end.line && range.start.column === range.end.column;
    if (!empty) return { file, replace: range, by: pin };
    if (j < 0) return { file, at: range, insert: `node ${node} { ${pin} }` };
    const nextChar = text(file)[offsetOf(text(file), range.start) ?? 0];
    return { file, replace: range, by: ` ${pin}${nextChar === '}' ? ' ' : ''}` };
  });
}

/**
 * The full visible `order` + the entries of `previousOrder` that are not visible (hidden by `collapsed` or `exclude`):
 * each one goes right after the entry that preceded it in `previousOrder` (or at the start if none survives).
 */
function orderWithHidden(order: readonly string[], previousOrder: readonly string[]): string[] {
  const result = [...new Set(order)];
  previousOrder.forEach((id, i) => {
    if (result.includes(id)) return;
    const previous = previousOrder.slice(0, i).filter((p) => result.includes(p)).at(-1);
    result.splice(previous === undefined ? 0 : result.indexOf(previous) + 1, 0, id);
  });
  return result;
}

/**
 * Rewrites the whole `order` of a sequence View (hidden entries keep their relative position) or inserts it before
 * the View's `}`, even if it matches the first-appearance order. An id that is not a Node rejects with `invalid`.
 */
export function reorderLifelines(files: WorkspaceFiles, intent: OrderIntent, seen?: Seen): GestureResult {
  const { view } = intent;
  return runGesture(files, view, seen, ({ declared, index, locate }) => {
    if (declared.type !== 'sequence') return reject('invalid', `View '${view}' is not a sequence View`);
    const total = declared.order.length;
    const start = total > 0 ? locate(['views', index, 'order', 0]) : locate(['views', index, 'overrides']);
    const end = total > 0 ? locate(['views', index, 'order', total - 1]) : start;
    if (start === null || end === null) return reject('invalid', `Could not find where to write the order of '${view}'`);
    const list = orderWithHidden(intent.order, declared.order).join(', ');
    const { file } = start;
    if (total > 0) return { file, replace: { start: start.range.start, end: end.range.end }, by: list };
    return { file, at: start.range, insert: `order ${list}` };
  });
}

/** Theme a View falls back to when it stops setting its own but keeps its patch. */
const DEFAULT_THEME = 'neutral';

/** The range of `statement` widened to its whole line (with the newline) if it shares the line with nothing else. */
function wholeLineOf(text: string, statement: TextRange): TextRange {
  const lines = text.split('\n');
  const { start, end } = statement;
  const before = (lines[start.line - 1] ?? '').slice(0, start.column - 1);
  const after = (lines[end.line - 1] ?? '').slice(end.column - 1);
  if (before.trim() !== '' || after.trim() !== '' || end.line >= lines.length) return statement;
  return { start: { line: start.line, column: 1 }, end: { line: end.line + 1, column: 1 } };
}

/**
 * With `theme` in the View it rewrites the name (the patch stays); without `theme` it inserts `theme <theme>` as the
 * first line of the body. Without `theme` in the Intent it removes the statement, or leaves `theme neutral { patch }`
 * if it had a patch. A Theme the Canonical form does not declare rejects with `unknown-theme`.
 */
export function setTheme(files: WorkspaceFiles, intent: ThemeIntent, seen?: Seen): GestureResult {
  const { view, theme } = intent;
  return runGesture(files, view, seen, ({ declared, index, locate, text, source }) => {
    if (theme !== undefined && !source.themes.some(({ name }) => name === theme)) {
      const nearest = nearestCandidates(theme, source.themes.map(({ name }) => name));
      return reject('unknown-theme', `No such Theme '${theme}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`);
    }
    if (declared.theme === undefined) {
      if (theme === undefined) return reject('invalid', `View '${view}' does not set a Theme`);
      const body = locate(['views', index, 'cuerpo']);
      if (body === null) return reject('invalid', `Could not find where to write the Theme of '${view}'`);
      return { file: body.file, after: body.range, insert: `theme ${theme}` };
    }
    const name = locate(['views', index, 'theme']);
    const statement = locate(['views', index, 'theme', 'sentencia']);
    if (name === null || statement === null) return reject('invalid', `Could not find the Theme of '${view}'`);
    if (theme !== undefined) return { file: name.file, replace: name.range, by: theme };
    if (declared.themePatch !== undefined) return { file: name.file, replace: name.range, by: DEFAULT_THEME };
    return { file: statement.file, replace: wholeLineOf(text(statement.file), statement.range), by: '' };
  });
}
