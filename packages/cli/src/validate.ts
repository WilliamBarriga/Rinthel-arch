import { CONTRACT_VERSION } from 'canonico';
import type { Issue, SalidaDeValidate } from 'canonico';

export interface OpcionesDeValidate {
  maxIssues: number;
  strict: boolean;
}

/** Construye el objeto del contrato a partir de todos los issues, ya ordenados. */
export function informe(issues: Issue[], { maxIssues, strict }: OpcionesDeValidate): SalidaDeValidate {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    contractVersion: CONTRACT_VERSION,
    ok: errors === 0 && !(strict && warnings > 0),
    summary: { errors, warnings, truncated: issues.length > maxIssues },
    issues: issues.slice(0, maxIssues),
  };
}

/** Texto para humanos: una linea por issue y un resumen. */
export function textoLegible(salida: SalidaDeValidate): string {
  const lineas = salida.issues.map(
    (i) => `${i.file}:${i.line}:${i.column} ${i.severity} ${i.code} ${i.message}`,
  );
  const { errors, warnings, truncated } = salida.summary;
  lineas.push(`${errors} errores, ${warnings} avisos${truncated ? ' (lista truncada)' : ''}`);
  return `${lineas.join('\n')}\n`;
}
