/**
 * Import extractors: one per language family. Each reads a file's text and says, per import, what it points at; the
 * scan maps that to units and externals. A new language is one more entry in `IMPORT_EXTRACTORS` (`./index.ts`).
 */

export interface ImportContext {
  /** Every listed file, relative to the root. */
  files: ReadonlySet<string>;
}

/**
 * - `file`: a path in the repo; `exists: false` when no listed file matches (the owner of the path is still known).
 * - `package`: a package name in an ecosystem; it is a unit if a manifest of that ecosystem has that name, else an external.
 * - `unresolved`: neither (path aliases, absolute paths, URLs); only counted in `limits.unresolvedImports`.
 */
export type ImportTarget = { file: string; exists: boolean } | { package: string; ecosystem: string } | { unresolved: true };

export interface FoundImport {
  /** 1-based line of the import. */
  line: number;
  target: ImportTarget;
}

export type ReadImports = (path: string, text: string, context: ImportContext) => FoundImport[];

export interface ImportExtractor {
  /** Languages (as in `languages.ts`) whose files it reads. */
  languages: readonly string[];
  /** Called once per scan, only if the repo has files of its languages (grammars load lazily). */
  load(): Promise<ReadImports>;
}
