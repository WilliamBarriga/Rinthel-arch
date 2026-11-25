/**
 * `scanner`: reads a codebase, without running it, into a Scan draft `rinthel/scan@1` (ADR 0010).
 * Interface: `scan(root, options?) -> Promise<ScanDraft>` and `serializeDraft(draft) -> string` (what `scan` writes);
 * for refreshing a Workspace, `diffDrafts(previous, current)` and `idMatcher(patterns)` (`.rinthel/scan-ignore`).
 * Invariants: never executes, installs or imports project code (git state is read from `.git` files, not `git`);
 * same files, same draft byte for byte (sorted arrays, fixed key order, ids from paths and names, no clock).
 * Honors `.gitignore` and `EXCLUDED_FOLDERS`; stops at `maxFiles` and marks `limits.truncated` instead of failing.
 * Modes of error: unreadable files are skipped; only a `root` that is not a readable folder throws.
 * Depends on no workspace package (only `cli` imports it). External: `web-tree-sitter` with the official grammars' `.wasm`, `ignore`.
 */
import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { byCodeUnit, groupBy } from './collections';
import { SCAN_DRAFT_SCHEMA } from './draft';
import type { LanguageCount, ScanDraft } from './draft';
import { listFiles } from './files';
import { readCommit } from './git';
import { IMPORT_EXTRACTORS } from './imports';
import { readImports } from './imports/aggregate';
import { languageOf } from './languages';
import { readTables } from './tables';
import { buildUnits } from './units';

export { SCAN_DRAFT_SCHEMA } from './draft';
export type {
  Confidence,
  LanguageCount,
  ScanColumn,
  ScanDependency,
  ScanDraft,
  ScanExternal,
  ScanLimits,
  ScanRelation,
  ScanTable,
  ScanUnit,
  Source,
  UnitKind,
} from './draft';
export { byCodeUnit } from './collections';
export { EXCLUDED_FOLDERS } from './files';
export { MAX_EXAMPLES } from './imports/aggregate';
export { diffDrafts, idMatcher } from './refresh';
export type { DraftChanges, IdChanges } from './refresh';
export { SPLIT_MIN_FILES } from './units';

/** Version written in `scanner`; it follows `packages/scanner/package.json`. */
export const SCANNER_VERSION = '0.1.0';
export const DEFAULT_DEPTH = 2;
export const DEFAULT_MAX_FILES = 20_000;
/** Larger source files (bundles, generated code) count in their unit but are not parsed. */
export const MAX_PARSE_BYTES = 1_000_000;

export interface ScanOptions {
  /** Folder levels a large leaf unit is split into (`SPLIT_MIN_FILES`); 0 never splits. Default `DEFAULT_DEPTH`. */
  depth?: number;
  /** Files listed at most. Default `DEFAULT_MAX_FILES`. */
  maxFiles?: number;
}

/** Scans the folder `root`. Throws only if `root` is not a readable folder. */
export async function scan(root: string, options: ScanOptions = {}): Promise<ScanDraft> {
  const absolute = resolve(root);
  if (!statSync(absolute).isDirectory()) throw new Error(`'${root}' is not a folder`);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const { files, truncated } = listFiles(absolute, maxFiles);
  const readText = (path: string): string | undefined => {
    try {
      return readFileSync(join(absolute, path), 'utf8');
    } catch {
      return undefined;
    }
  };
  let largeFilesSkipped = 0;
  const parseable = (path: string): string | undefined => {
    if (statSync(join(absolute, path)).size > MAX_PARSE_BYTES) {
      largeFilesSkipped++;
      return undefined;
    }
    return readText(path);
  };
  const { units, manifests, ownerOf } = buildUnits(files, readText, basename(absolute), options.depth ?? DEFAULT_DEPTH);
  const unitOfFile = (path: string): string => ownerOf(path.slice(0, Math.max(path.lastIndexOf('/'), 0)));

  const byLanguage = new Map<string, string[]>();
  for (const [language, inLanguage] of groupBy(files, (file) => languageOf(file) ?? '')) {
    if (language !== '') byLanguage.set(language, inLanguage);
  }
  const { dependencies, externals, unresolvedImports } = await readImports({ files, byLanguage, manifests, ownerOf, unitOfFile, parseable });
  const tables = await readTables(files, parseable, unitOfFile);

  const covered = new Set(IMPORT_EXTRACTORS.flatMap((extractor) => extractor.languages));
  const languagesWithoutImports: LanguageCount[] = [...byLanguage]
    .filter(([language]) => !covered.has(language))
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([language, inLanguage]) => ({ language, files: inLanguage.length }));

  return {
    schema: SCAN_DRAFT_SCHEMA,
    root: '.',
    commit: readCommit(absolute),
    scanner: SCANNER_VERSION,
    limits: { maxFiles, files: files.length, truncated, largeFilesSkipped, unresolvedImports, languagesWithoutImports },
    units,
    dependencies,
    externals,
    tables,
  };
}

/** The draft as `scan` writes it: two-space JSON with a final newline. */
export function serializeDraft(draft: ScanDraft): string {
  return `${JSON.stringify(draft, null, 2)}\n`;
}
