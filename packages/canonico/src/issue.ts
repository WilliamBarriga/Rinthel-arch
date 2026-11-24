/**
 * Issue de `validate` (ADR 0005). Posiciones 1-based. El texto de `message` y `hint` no es contrato;
 * `code`, `severity`, la posicion y la forma de `fix` si. `fix` solo con un candidato inequivoco; si hay
 * ambiguedad, `hint`.
 */

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

/** Otro sitio relacionado (p. ej. el Nodo original de un duplicado). */
export interface IssueRelated {
  file: string;
  line: number;
  column: number;
  message: string;
}

/**
 * Edicion estructurada sobre el DSL de texto; nunca sobre el JSON canonico. Con `rename`, el `fix` renombra
 * `file` (archivo o carpeta del Workspace) a esa ruta; `range` y `replacement` son entonces una edicion vacia.
 */
export interface IssueFix {
  file: string;
  range: TextRange;
  replacement: string;
  rename?: string;
}

/** `code` es un string abierto: un consumidor ignora los codigos que no conoce y un codigo deprecado sigue siendo representable. */
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
