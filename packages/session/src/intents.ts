import type { Intent, Issue } from 'canonical';
import type { ArchivosDelWorkspace } from 'dsl';

import type { HashedEdit, EditResult } from './edits';
import { setTheme, movePin, reorderLifelines } from './gestures';
import type { GestureResult, Seen } from './gestures';

export type { Intent };
export type { Seen };

export type IntentResult = GestureResult;

/**
 * Pure reducer: a new map or a rejection with `reason`. `seen` rejects with `stale-hash` if the file that
 * changes differs; without `seen` it applies over the current text. It does not write.
 */
export function applyIntent(files: ArchivosDelWorkspace, intent: Intent, seen?: Seen): IntentResult {
  switch (intent.type) {
    case 'move-pin': {
      const { type: _type, ...pin } = intent;
      return movePin(files, pin, seen);
    }
    case 'reorder-lifelines': {
      const { type: _type, ...order } = intent;
      return reorderLifelines(files, order, seen);
    }
    case 'set-theme': {
      const { type: _type, ...theme } = intent;
      return setTheme(files, theme, seen);
    }
  }
}

/** Immutable undo/redo stack over the Workspace text (Undo history); `files` is the current one. */
export interface UndoHistory {
  readonly files: ArchivosDelWorkspace;
  readonly past: readonly ArchivosDelWorkspace[];
  readonly future: readonly ArchivosDelWorkspace[];
}

export const createUndoHistory = (files: ArchivosDelWorkspace): UndoHistory => ({ files, past: [], future: [] });

/** Records `files` as current and drops the future. It does not check that it differs from the current one. */
export const pushState = (history: UndoHistory, files: ArchivosDelWorkspace): UndoHistory => ({
  files,
  past: [...history.past, history.files],
  future: [],
});

/** Applies an Intent and pushes it; drops the future. A rejection leaves the history untouched. */
export function editInHistory(
  history: UndoHistory,
  intent: Intent,
): EditResult<{ history: UndoHistory; edits: HashedEdit[]; issues: Issue[] }> {
  const r = applyIntent(history.files, intent);
  if (!r.ok) return r;
  return {
    ok: true,
    history: pushState(history, r.files),
    edits: r.edits,
    issues: r.issues,
  };
}

/** Restores the previous text exactly; `undefined` if there is nothing to undo. */
export function undo(history: UndoHistory): UndoHistory | undefined {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return undefined;
  return {
    files: previous,
    past: history.past.slice(0, -1),
    future: [history.files, ...history.future],
  };
}

/** Reapplies the last undone edit; `undefined` if there is nothing to redo. */
export function redo(history: UndoHistory): UndoHistory | undefined {
  const [next, ...rest] = history.future;
  if (next === undefined) return undefined;
  return { files: next, past: [...history.past, history.files], future: rest };
}
