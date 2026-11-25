/**
 * The column and relation conventions every schema reader shares (ADR 0010): which flags a column carries and how a
 * foreign key becomes a relation with its cardinality.
 */
import type { Confidence, ScanColumn, Source } from '../draft';
import type { FoundRelation } from '.';

export interface ForeignKeyShape {
  /** The fk columns hold unique values (a primary key or a unique constraint of their own). */
  unique: boolean;
  /** The fk column accepts NULL. */
  optional: boolean;
}

/**
 * `[from side, to side]`: `0..1` from a unique key (else `0..*`), `0..1` to a nullable key (else `1`). `source`: where
 * the foreign key is written.
 */
export function relationOf(
  column: string,
  target: { table: string; column: string },
  { unique, optional }: ForeignKeyShape,
  source: Source,
  confidence: Confidence = 'extracted',
): FoundRelation {
  return { column, target, cardinality: [unique ? '0..1' : '0..*', optional ? '0..1' : '1'], source, confidence };
}

export interface ColumnShape {
  name: string;
  type: string;
  pk: boolean;
  /** Unique on its own (single-column unique constraint). */
  unique: boolean;
  /** Accepts NULL. */
  optional: boolean;
  fk: boolean;
}

/** Flags only when true; `uk` and `optional` never on a primary key column. */
export function scanColumn({ name, type, pk, unique, optional, fk }: ColumnShape): ScanColumn {
  const column: ScanColumn = { name, type };
  if (pk) column.pk = true;
  if (fk) column.fk = true;
  if (unique && !pk) column.uk = true;
  if (optional && !pk) column.optional = true;
  return column;
}
