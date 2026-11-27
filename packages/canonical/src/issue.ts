/**
 * `validate` Issue (ADR 0005). 1-based positions. The text of `message` and `hint` is not contract;
 * `code`, `severity`, the position and the shape of `fix` are. `fix` only with an unambiguous candidate; if there is
 * ambiguity, `hint`.
 */

export type Severity = 'error' | 'warning';

/** 1-based position within a file. */
export interface TextPosition {
  line: number;
  column: number;
}

/** 1-based text span: start included, end excluded. */
export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

/** Another related location (e.g. the original Node of a duplicate). */
export interface IssueRelated {
  file: string;
  line: number;
  column: number;
  message: string;
}

/**
 * Structured edit on the Text DSL; never on the canonical JSON. With `rename`, the `fix` renames
 * `file` (a Workspace file or folder) to that path; `range` and `replacement` are then an empty edit.
 */
export interface IssueFix {
  file: string;
  range: TextRange;
  replacement: string;
  rename?: string;
}

/** `code` is an open string: a consumer ignores the codes it does not know and a deprecated code is still representable. */
export interface Issue {
  code: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  hint?: string;
  related?: IssueRelated[];
  fix?: IssueFix;
}
