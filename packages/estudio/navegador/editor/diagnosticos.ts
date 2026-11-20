/**
 * Issues en linea: los `IssueDeDev` del estado (SSE) de un archivo se vuelven `Diagnostic` de `@codemirror/lint` en su
 * posicion, con el `fix` como accion "Aplicar fix". El panel Issues (#192) usa el mismo `aplicarFix`. Puro.
 */
import type { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';

import type { IssueDeDev } from '../../src/protocolo';

export type FixDeIssue = NonNullable<IssueDeDev['fix']>;

const offset = (doc: Text, line: number, column: number): number => {
  const linea = doc.line(Math.min(Math.max(line, 1), doc.lines));
  return Math.min(linea.from + column - 1, linea.to);
};

export function diagnosticosDe(doc: Text, file: string, issues: readonly IssueDeDev[], aplicarFix: (fix: FixDeIssue) => void): Diagnostic[] {
  return issues
    .filter((i) => i.file === file)
    .map((issue) => {
      const from = offset(doc, issue.line, issue.column);
      const hasta = issue.fix !== undefined && issue.fix.file === file ? offset(doc, issue.fix.range.end.line, issue.fix.range.end.column) : doc.lineAt(from).to;
      const { fix } = issue;
      return {
        from,
        to: Math.max(from, hasta),
        severity: issue.severity,
        message: issue.hint === undefined ? issue.message : `${issue.message} (${issue.hint})`,
        source: issue.code,
        ...(fix !== undefined && { actions: [{ name: 'Aplicar fix', apply: () => aplicarFix(fix) }] }),
      };
    });
}
