import { CONTRACT_VERSION } from 'canonical';
import type { Issue, ValidateOutput } from 'canonical';

export interface ValidateOptions {
  maxIssues: number;
  strict: boolean;
}

/** Contract order: file, line, column and code. */
function compareIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}

/** Sorts the issues: they come from several sources with no common order. */
export function buildOutput(
  unordered: readonly Issue[],
  { maxIssues, strict }: ValidateOptions,
): ValidateOutput {
  const issues = [...unordered].sort(compareIssues);
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    contractVersion: CONTRACT_VERSION,
    ok: errors === 0 && !(strict && warnings > 0),
    summary: { errors, warnings, truncated: issues.length > maxIssues },
    issues: issues.slice(0, maxIssues),
  };
}

/** Its `hint`, or the replacement of its `fix` as "did you mean". */
const hintText = (issue: Issue): string =>
  issue.hint !== undefined ? `; ${issue.hint}` : issue.fix !== undefined && issue.fix.replacement !== '' ? `; did you mean '${issue.fix.replacement}'` : '';

/** One line per issue and a summary. */
export function readableText(output: ValidateOutput): string {
  const lines = output.issues.map(
    (issue) =>
      `${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.code} ${issue.message}${hintText(issue)}`,
  );
  const { errors, warnings, truncated } = output.summary;
  lines.push(`${errors} errors, ${warnings} warnings${truncated ? ' (list truncated)' : ''}`);
  return `${lines.join('\n')}\n`;
}
