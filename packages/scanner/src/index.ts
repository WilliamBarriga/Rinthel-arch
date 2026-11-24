/**
 * `scanner`: reads a codebase, without running it, into a Scan draft `rinthel/scan@1` (ADR 0010).
 * Interface: `scan(root, options?) -> Promise<ScanDraft>` and `serializeDraft(draft) -> string` (what `scan` writes).
 * Invariants: never executes, installs or imports project code (git state is read from `.git` files, not `git`);
 * same files, same draft byte for byte (sorted arrays, fixed key order, ids from paths and names, no clock).
 * Honors `.gitignore` and `EXCLUDED_FOLDERS`; stops at `maxFiles` and marks `limits.truncated` instead of failing.
 * Modes of error: unreadable files are skipped; only a `root` that is not a readable folder throws.
 * Depends on no workspace package (only `cli` imports it). External: `web-tree-sitter` with the official grammars' `.wasm`, `ignore`.
 */
import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { SCAN_DRAFT_SCHEMA } from './draft';
import type { Confidence, LanguageCount, ScanDependency, ScanDraft, ScanExternal, ScanTable, Source } from './draft';
import { byCodeUnit, listFiles } from './files';
import { readCommit } from './git';
import { IMPORT_EXTRACTORS } from './imports';
import type { FoundImport } from './imports';
import { languageOf } from './languages';
import { normalizePackage } from './manifests';
import { TABLE_EXTRACTORS } from './tables';
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
export { EXCLUDED_FOLDERS } from './files';
export { SPLIT_MIN_FILES } from './units';

/** Version written in `scanner`; it follows `packages/scanner/package.json`. */
export const SCANNER_VERSION = '0.1.0';
export const DEFAULT_DEPTH = 2;
export const DEFAULT_MAX_FILES = 20_000;
/** Examples kept per dependency and per external. */
export const MAX_EXAMPLES = 3;
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
  const { units, manifests, ownerOf } = buildUnits(files, readText, basename(absolute), options.depth ?? DEFAULT_DEPTH);
  const unitOfFile = (path: string): string => ownerOf(path.slice(0, Math.max(path.lastIndexOf('/'), 0)));

  const internal = new Map<string, string>();
  const declared = new Set<string>();
  for (const [id, inFolder] of manifests) {
    for (const manifest of inFolder) {
      if (manifest.name !== undefined) internal.set(`${manifest.ecosystem}:${normalizePackage(manifest.ecosystem, manifest.name)}`, id);
      for (const name of manifest.declares) declared.add(`${manifest.ecosystem}:${normalizePackage(manifest.ecosystem, name)}`);
    }
  }

  const byLanguage = new Map<string, string[]>();
  for (const file of files) {
    const language = languageOf(file);
    if (language === undefined) continue;
    const inLanguage = byLanguage.get(language);
    if (inLanguage === undefined) byLanguage.set(language, [file]);
    else inLanguage.push(file);
  }

  const dependencies = new Aggregate();
  const externals = new Aggregate();
  let unresolvedImports = 0;
  let largeFilesSkipped = 0;
  const parseable = (path: string): string | undefined => {
    if (statSync(join(absolute, path)).size > MAX_PARSE_BYTES) {
      largeFilesSkipped++;
      return undefined;
    }
    return readText(path);
  };

  const fileSet = new Set(files);
  for (const extractor of IMPORT_EXTRACTORS) {
    const own = extractor.languages.flatMap((language) => byLanguage.get(language) ?? []).sort(byCodeUnit);
    if (own.length === 0) continue;
    const read = await extractor.load();
    for (const path of own) {
      const text = parseable(path);
      if (text === undefined) continue;
      const from = unitOfFile(path);
      for (const { line, target } of read(path, text, { files: fileSet }) as FoundImport[]) {
        const example = { file: path, line };
        if ('unresolved' in target) {
          unresolvedImports++;
        } else if ('file' in target) {
          const to = target.exists ? unitOfFile(target.file) : ownerOf(target.file);
          if (to !== from) dependencies.add(`${from}->${to}`, { from, to }, from, example, target.exists ? 'extracted' : 'inferred');
        } else {
          const key = `${target.ecosystem}:${target.package}`;
          const to = internal.get(key);
          if (to === undefined) {
            externals.add(key, { name: target.package, ecosystem: target.ecosystem }, from, example, declared.has(key) ? 'extracted' : 'inferred');
          } else if (to !== from) {
            dependencies.add(`${from}->${to}`, { from, to }, from, example, 'extracted');
          }
        }
      }
    }
  }

  const tables: ScanTable[] = [];
  for (const extractor of TABLE_EXTRACTORS) {
    const own = files.filter((path) => extractor.matches(path));
    if (own.length === 0) continue;
    const read = await extractor.load();
    for (const path of own) {
      const text = parseable(path);
      if (text !== undefined) tables.push(...read(path, text).map((table) => ({ ...table, unit: unitOfFile(path) })));
    }
  }

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
    dependencies: dependencies.entries().map(
      ({ id, fields, examples, confidence, weight }): ScanDependency => ({
        id,
        from: fields.from as string,
        to: fields.to as string,
        kind: 'import',
        weight,
        examples,
        source: examples[0] as Source,
        confidence,
      }),
    ),
    externals: externals.entries().map(
      ({ id, fields, importers, examples, confidence, weight }): ScanExternal => ({
        id,
        name: fields.name as string,
        ecosystem: fields.ecosystem as string,
        importedBy: importers,
        weight,
        examples,
        source: examples[0] as Source,
        confidence,
      }),
    ),
    tables: tables.sort((a, b) => byCodeUnit(a.id, b.id)),
  };
}

/** The draft as `scan` writes it: two-space JSON with a final newline. */
export function serializeDraft(draft: ScanDraft): string {
  return `${JSON.stringify(draft, null, 2)}\n`;
}

/** Import statements grouped by id; examples sorted by file and line. `extracted` if any import was. */
class Aggregate {
  private readonly groups = new Map<
    string,
    { fields: Record<string, string>; importers: Set<string>; examples: Source[]; extracted: boolean }
  >();

  add(id: string, fields: Record<string, string>, importer: string, example: Source, confidence: Confidence): void {
    const group = this.groups.get(id) ?? { fields, importers: new Set(), examples: [], extracted: false };
    group.importers.add(importer);
    group.examples.push(example);
    group.extracted ||= confidence === 'extracted';
    this.groups.set(id, group);
  }

  entries() {
    return [...this.groups]
      .sort(([a], [b]) => byCodeUnit(a, b))
      .map(([id, { fields, importers, examples, extracted }]) => {
        const sorted = [...examples].sort((a, b) => byCodeUnit(a.file, b.file) || a.line - b.line);
        return {
          id,
          fields,
          importers: [...importers].sort(byCodeUnit),
          weight: examples.length,
          examples: sorted.slice(0, MAX_EXAMPLES),
          confidence: (extracted ? 'extracted' : 'inferred') as Confidence,
        };
      });
  }
}
