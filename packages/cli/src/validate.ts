import { CONTRACT_VERSION } from 'canonico';
import type { Issue, SalidaDeValidate } from 'canonico';

export interface OpcionesDeValidate {
  maxIssues: number;
  strict: boolean;
}

/** Orden del contrato: archivo, linea, columna y codigo. */
function compararIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}

/** Ordena los issues: llegan de varias fuentes sin orden comun. */
export function construirSalida(
  desordenados: readonly Issue[],
  { maxIssues, strict }: OpcionesDeValidate,
): SalidaDeValidate {
  const issues = [...desordenados].sort(compararIssues);
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    contractVersion: CONTRACT_VERSION,
    ok: errors === 0 && !(strict && warnings > 0),
    summary: { errors, warnings, truncated: issues.length > maxIssues },
    issues: issues.slice(0, maxIssues),
  };
}

/** Su `hint`, o el reemplazo de su `fix` como "did you mean". */
const pista = (issue: Issue): string =>
  issue.hint !== undefined ? `; ${issue.hint}` : issue.fix !== undefined && issue.fix.replacement !== '' ? `; did you mean '${issue.fix.replacement}'` : '';

/** Una linea por issue y un resumen. */
export function textoLegible(salida: SalidaDeValidate): string {
  const lineas = salida.issues.map(
    (issue) =>
      `${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.code} ${issue.message}${pista(issue)}`,
  );
  const { errors, warnings, truncated } = salida.summary;
  lineas.push(`${errors} errors, ${warnings} warnings${truncated ? ' (list truncated)' : ''}`);
  return `${lineas.join('\n')}\n`;
}
