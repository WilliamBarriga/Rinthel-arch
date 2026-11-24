/**
 * Schema extractors (Prisma, SQL DDL, Drizzle, Django, SQLAlchemy): each reads every file it recognizes at once,
 * statically, and returns tables by name. The scan gives each table its unit and its id, and resolves relation targets
 * to ids (`identifyTables`). A new source is one more entry in `TABLE_EXTRACTORS`.
 */
import type { Confidence, ScanTable, Source } from '../draft';
import { byCodeUnit } from '../files';
import { django } from './django';
import { drizzle } from './drizzle';
import { prisma } from './prisma';
import { sql } from './sql';
import { sqlalchemy } from './sqlalchemy';

export interface SchemaFile {
  /** Relative to the scan root, `/`-separated. */
  path: string;
  text: string;
}

/** What a reader may know besides its own files. */
export interface SchemaContext {
  /** Every listed file of the scan (relative paths), for markers such as `migration_lock.toml`. */
  files: ReadonlySet<string>;
}

/** A foreign key as an extractor finds it: target by table name, not by id. */
export interface FoundRelation {
  /** Column of the table that holds the key. */
  column: string;
  target: { table: string; column: string };
  /** `[from side, to side]`, for example `["0..*", "1"]`. */
  cardinality: [string, string];
  confidence: Confidence;
}

/** A table as an extractor finds it; `name` is the database name. */
export type FoundTable = Omit<ScanTable, 'id' | 'unit' | 'relations'> & { relations: FoundRelation[] };

export interface TableExtractor {
  /** `origin` of its tables, for example `prisma`. */
  origin: string;
  /** Whether it reads this file (path relative to the root). */
  matches(path: string): boolean;
  /**
   * Called once per scan, only if some file matches (grammars and parsers load lazily). The reader gets every
   * matching file, sorted by path, so it can resolve names across files (multi-file schemas, migration histories).
   * It never throws: what it cannot read it skips.
   */
  load(): Promise<(files: readonly SchemaFile[], context: SchemaContext) => FoundTable[]>;
}

export const TABLE_EXTRACTORS: readonly TableExtractor[] = [prisma, sql, drizzle, django, sqlalchemy];

/**
 * Gives each table its id and points relations at ids. The id is the table name; when several tables share a name
 * (two schemas, or one table found by two extractors), each of them is `<schema file>:<name>`. A relation target is
 * the table of that name, preferring the same origin and then the nearest schema file; a target that no extractor
 * found keeps its name and is `inferred`. Sorted by id.
 */
export function identifyTables(found: readonly (FoundTable & { unit: string })[]): ScanTable[] {
  const byName = groupBy(found, (table) => table.name);
  const byCaselessName = groupBy(found, (table) => table.name.toLowerCase());
  const idOf = (table: FoundTable): string => ((byName.get(table.name)?.length ?? 0) > 1 ? `${table.source.file}:${table.name}` : table.name);
  const targetOf = (from: FoundTable, name: string): FoundTable | undefined =>
    [...(byName.get(name) ?? byCaselessName.get(name.toLowerCase()) ?? [])].sort(
      (a, b) =>
        Number(b.origin === from.origin) - Number(a.origin === from.origin) ||
        sharedFolders(b.source, from.source) - sharedFolders(a.source, from.source) ||
        byCodeUnit(idOf(a), idOf(b)),
    )[0];

  return found
    .map((table): ScanTable => {
      const id = idOf(table);
      return {
        id,
        name: table.name,
        origin: table.origin,
        unit: table.unit,
        columns: table.columns,
        relations: table.relations.map(({ column, target, cardinality, confidence }) => {
          const to = targetOf(table, target.table);
          return {
            from: `${id}#${column}`,
            to: `${to === undefined ? target.table : idOf(to)}#${target.column}`,
            cardinality,
            confidence: to === undefined ? 'inferred' : confidence,
          };
        }),
        source: table.source,
        confidence: table.confidence,
      };
    })
    .sort((a, b) => byCodeUnit(a.id, b.id));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/** Leading folders two files share. */
function sharedFolders(a: Source, b: Source): number {
  const left = a.file.split('/').slice(0, -1);
  const right = b.file.split('/').slice(0, -1);
  let shared = 0;
  while (shared < left.length && left[shared] === right[shared]) shared++;
  return shared;
}
