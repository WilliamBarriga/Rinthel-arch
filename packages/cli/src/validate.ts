import { CONTRACT_VERSION } from 'canonico';
import type { Issue, SalidaDeValidate } from 'canonico';

export interface OpcionesDeValidate {
  maxIssues: number;
  strict: boolean;
}

/** Orden del contrato (ADR 0005): archivo, linea, columna y codigo. */
function compararIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}

/** Construye el objeto del contrato a partir de todos los issues, que ordena aqui para que los de varias fuentes se mezclen bien. */
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

/** La pista del issue para quien lee texto: su `hint`, o el reemplazo de su `fix` como "quisiste decir". */
const pista = (issue: Issue): string =>
  issue.hint !== undefined ? `; ${issue.hint}` : issue.fix !== undefined && issue.fix.replacement !== '' ? `; quisiste decir '${issue.fix.replacement}'` : '';

/** Texto para humanos: una linea por issue (con su pista, si tiene) y un resumen. */
export function textoLegible(salida: SalidaDeValidate): string {
  const lineas = salida.issues.map(
    (issue) =>
      `${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.code} ${issue.message}${pista(issue)}`,
  );
  const { errors, warnings, truncated } = salida.summary;
  lineas.push(`${errors} errores, ${warnings} avisos${truncated ? ' (lista truncada)' : ''}`);
  return `${lineas.join('\n')}\n`;
}
