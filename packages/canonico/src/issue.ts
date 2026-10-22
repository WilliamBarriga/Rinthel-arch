/**
 * Contrato de salida de `validate` (ADR 0005): errores y avisos como datos.
 *
 * Posiciones 1-based (`line`, `column`). El texto de `message` y `hint` no es
 * contrato publico; `code`, `severity`, la posicion y la estructura de `fix` si
 * lo son. Los campos marcados como opcionales solo se emiten cuando aportan:
 * `fix` unicamente con un unico candidato inequivoco; con ambiguedad, `hint`.
 */

/** Severidad de un issue. `0` sin errores, `1` con errores (ADR 0005). */
export type Severity = 'error' | 'warning';

/** Posicion 1-based dentro de un archivo. */
export interface TextPosition {
  line: number;
  column: number;
}

/** Tramo de texto 1-based: inicio incluido, final excluido. */
export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

/** Punto de referencia de otro issue relacionado (p. ej. el Nodo duplicado original). */
export interface IssueRelated {
  file: string;
  line: number;
  column: number;
  message: string;
}

/** Edicion estructurada sobre el DSL de texto; nunca sobre el JSON canonico. */
export interface IssueFix {
  file: string;
  range: TextRange;
  replacement: string;
}

/**
 * Un issue de validacion. `code` es un string plano y no un union cerrado:
 * un consumidor debe ignorar los codigos que no conoce (ADR 0005), y un codigo
 * deprecatado sigue siendo representable.
 */
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
