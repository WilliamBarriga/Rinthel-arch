/** How the ORM readers (Drizzle, Django, SQLAlchemy) turn a foreign key into a relation with its cardinality. */
import type { Confidence } from '../draft';
import type { FoundRelation } from '.';

export interface ForeignKeyShape {
  /** The fk columns hold unique values (a primary key or a unique constraint of their own). */
  unique: boolean;
  /** The fk column accepts NULL. */
  optional: boolean;
}

/** `[from side, to side]`: `0..1` from a unique key (else `0..*`), `0..1` to a nullable key (else `1`). */
export function relationOf(
  column: string,
  target: { table: string; column: string },
  { unique, optional }: ForeignKeyShape,
  confidence: Confidence = 'extracted',
): FoundRelation {
  return { column, target, cardinality: [unique ? '0..1' : '0..*', optional ? '0..1' : '1'], confidence };
}
