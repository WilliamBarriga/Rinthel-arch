/**
 * Minimal buffer changes: the CodeMirror `ChangeSet`s accumulated since the last save are translated into
 * `{ file, range, replacement }` edits over the base text (1-based ranges, end excluded, like `IssueFix`).
 * Only what changed is sent, never the whole file (ADR 0007). Pure.
 */
import { Text } from '@codemirror/state';
import type { ChangeSet } from '@codemirror/state';
import type { EditsRequest } from '../../src/protocol';

export type TextEditSpec = EditsRequest['ediciones'][number];

const position = (doc: Text, offset: number): { line: number; column: number } => {
  const line = doc.lineAt(offset);
  return { line: line.number, column: offset - line.from + 1 };
};

/** `changes` must start from `base` (its `length` is that of `base`). */
export function editsFromChanges(file: string, base: string, changes: ChangeSet): TextEditSpec[] {
  const doc = Text.of(base.split('\n'));
  const edits: TextEditSpec[] = [];
  changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    edits.push({ file, range: { start: position(doc, from), end: position(doc, to) }, replacement: inserted.toString() });
  });
  return edits;
}
