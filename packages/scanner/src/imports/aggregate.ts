/**
 * Turns the imports every extractor finds into the draft's `dependencies` (unit to unit) and `externals` (packages no
 * unit declares as its own name): one entry per id, with its weight, its importers and a few examples.
 */
import { byCodeUnit } from '../collections';
import type { Confidence, ScanDependency, ScanExternal, Source } from '../draft';
import type { Manifest } from '../manifests';
import { normalizePackage } from '../manifests';
import { IMPORT_EXTRACTORS } from '.';

/** Examples kept per dependency and per external. */
export const MAX_EXAMPLES = 3;

/** What the scan knows about the repo when it reads imports. */
export interface ImportScope {
  /** Every listed file, relative to the root. */
  files: readonly string[];
  /** Listed files by language (`languages.ts`). */
  byLanguage: ReadonlyMap<string, readonly string[]>;
  /** Manifests by unit id. */
  manifests: ReadonlyMap<string, readonly Manifest[]>;
  /** Unit id that owns a path (file or folder). */
  ownerOf(path: string): string;
  /** Unit id that owns a listed file. */
  unitOfFile(path: string): string;
  /** A file's text, or `undefined` if it is unreadable or too large to parse. */
  parseable(path: string): string | undefined;
}

export interface ImportGraph {
  dependencies: ScanDependency[];
  externals: ScanExternal[];
  /** Imports that name neither a file, a unit nor a package. */
  unresolvedImports: number;
}

interface AggregateEntry<T> {
  id: string;
  value: T;
  /** Importing units, sorted. */
  importers: string[];
  /** Import statements behind the entry. */
  weight: number;
  /** Up to `MAX_EXAMPLES`, sorted by file and line. */
  examples: Source[];
  confidence: Confidence;
}

/** Import statements grouped by id; examples sorted by file and line. `extracted` if any import was. */
export class Aggregate<T> {
  private readonly groups = new Map<string, { value: T; importers: Set<string>; examples: Source[]; extracted: boolean }>();

  /** `value` is kept from the first import of `id`. */
  add(id: string, value: T, importer: string, example: Source, confidence: Confidence): void {
    const group = this.groups.get(id) ?? { value, importers: new Set(), examples: [], extracted: false };
    group.importers.add(importer);
    group.examples.push(example);
    group.extracted ||= confidence === 'extracted';
    this.groups.set(id, group);
  }

  /** Sorted by id. */
  entries(): AggregateEntry<T>[] {
    return [...this.groups]
      .sort(([a], [b]) => byCodeUnit(a, b))
      .map(([id, { value, importers, examples, extracted }]) => ({
        id,
        value,
        importers: [...importers].sort(byCodeUnit),
        weight: examples.length,
        examples: [...examples].sort((a, b) => byCodeUnit(a.file, b.file) || a.line - b.line).slice(0, MAX_EXAMPLES),
        confidence: extracted ? 'extracted' : 'inferred',
      }));
  }
}

/** Runs each extractor whose languages the repo has, in code-unit order of its files, and aggregates what they find. */
export async function readImports(scope: ImportScope): Promise<ImportGraph> {
  const { ownerOf, unitOfFile } = scope;
  // A package is internal when a manifest of its ecosystem has its name; `declared` ones are read as written.
  const internal = new Map<string, string>();
  const declared = new Set<string>();
  for (const [id, inFolder] of scope.manifests) {
    for (const manifest of inFolder) {
      if (manifest.name !== undefined) internal.set(`${manifest.ecosystem}:${normalizePackage(manifest.ecosystem, manifest.name)}`, id);
      for (const name of manifest.declares) declared.add(`${manifest.ecosystem}:${normalizePackage(manifest.ecosystem, name)}`);
    }
  }

  const dependencies = new Aggregate<{ from: string; to: string }>();
  const externals = new Aggregate<{ name: string; ecosystem: string }>();
  let unresolvedImports = 0;
  const fileSet = new Set(scope.files);
  for (const extractor of IMPORT_EXTRACTORS) {
    const own = extractor.languages.flatMap((language) => scope.byLanguage.get(language) ?? []).sort(byCodeUnit);
    if (own.length === 0) continue;
    const read = await extractor.load();
    for (const path of own) {
      const text = scope.parseable(path);
      if (text === undefined) continue;
      const from = unitOfFile(path);
      for (const { line, target } of read(path, text, { files: fileSet })) {
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

  return {
    dependencies: dependencies.entries().map(
      ({ id, value: { from, to }, examples, confidence, weight }): ScanDependency => ({
        id,
        from,
        to,
        kind: 'import',
        weight,
        examples,
        source: examples[0] as Source,
        confidence,
      }),
    ),
    externals: externals.entries().map(
      ({ id, value: { name, ecosystem }, importers, examples, confidence, weight }): ScanExternal => ({
        id,
        name,
        ecosystem,
        importedBy: importers,
        weight,
        examples,
        source: examples[0] as Source,
        confidence,
      }),
    ),
    unresolvedImports,
  };
}
