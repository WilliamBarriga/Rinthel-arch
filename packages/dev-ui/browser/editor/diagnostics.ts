/**
 * Inline issues: the `DevIssue`s of a file in the state (SSE) become `@codemirror/lint` `Diagnostic`s at their
 * position, with the `fix` as an "Apply fix" action (`applyFix` receives the `fix` and its issue; whoever applies it
 * against `dev` uses `issues/apply-fix.ts`, the same as the Issues panel). Pure.
 */
import type { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';

import type { DevIssue } from '../../src/protocol';

export type IssueFix = NonNullable<DevIssue['fix']>;

const offset = (doc: Text, line: number, column: number): number => {
  const docLine = doc.line(Math.min(Math.max(line, 1), doc.lines));
  return Math.min(docLine.from + column - 1, docLine.to);
};

export function diagnosticsOf(doc: Text, file: string, issues: readonly DevIssue[], applyFix: (fix: IssueFix, issue: DevIssue) => void): Diagnostic[] {
  return issues
    .filter((i) => i.file === file)
    .map((issue) => {
      const from = offset(doc, issue.line, issue.column);
      const to = issue.fix !== undefined && issue.fix.file === file ? offset(doc, issue.fix.range.end.line, issue.fix.range.end.column) : doc.lineAt(from).to;
      const { fix } = issue;
      return {
        from,
        to: Math.max(from, to),
        severity: issue.severity,
        message: issue.hint === undefined ? issue.message : `${issue.message} (${issue.hint})`,
        source: issue.code,
        ...(fix !== undefined && { actions: [{ name: 'Apply fix', apply: () => applyFix(fix, issue) }] }),
      };
    });
}
