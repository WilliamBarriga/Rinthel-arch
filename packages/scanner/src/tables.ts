/**
 * Schema extractors (Prisma, SQL DDL, Drizzle, Django, SQLAlchemy): each reads the files it recognizes, statically,
 * and returns tables. The scan gives each table its unit and sorts them. A new source is one more entry in
 * `TABLE_EXTRACTORS`; none ships yet, so `tables` is empty.
 */
import type { ScanTable } from './draft';

/** A table as an extractor finds it; the scan fills `unit` from the file's owner. */
export type FoundTable = Omit<ScanTable, 'unit'>;

export interface TableExtractor {
  /** `origin` of its tables, for example `prisma`. */
  origin: string;
  /** Whether it reads this file (path relative to the root). */
  matches(path: string): boolean;
  /** Called once per scan, only if some file matches (grammars and parsers load lazily). */
  load(): Promise<(path: string, text: string) => FoundTable[]>;
}

export const TABLE_EXTRACTORS: readonly TableExtractor[] = [];
