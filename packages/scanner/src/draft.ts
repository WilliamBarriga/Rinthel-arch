/** Scan draft `rinthel/scan@1` (ADR 0010). Adding fields keeps the version; an incompatible change bumps it. */
export const SCAN_DRAFT_SCHEMA = 'rinthel/scan@1';

/** `extracted`: read as written. `inferred`: a guess the agent should review. */
export type Confidence = 'extracted' | 'inferred';

/** Path relative to the scan root, `/`-separated. `line` is 1-based; 0 means the item is the path itself (a folder). */
export interface Source {
  file: string;
  line: number;
}

/** A hint, not a Node kind: `module` groups other manifests (workspace root, Go module), `folder` is a path split. */
export type UnitKind = 'package' | 'app' | 'module' | 'folder';

export interface ScanUnit {
  /** The unit's folder relative to the root (`.` for the root). It is the Source `path` ref a Node cites. */
  id: string;
  name: string;
  kind: UnitKind;
  /** Nearest enclosing unit, or `null` for a top unit. */
  parent: string | null;
  /** Languages of the files the unit owns (not its sub-units'), sorted. */
  languages: string[];
  /** Files the unit owns: those under its folder and not under a sub-unit. */
  files: number;
  source: Source;
  confidence: Confidence;
}

export interface ScanDependency {
  /** `<from>-><to>`. */
  id: string;
  from: string;
  to: string;
  kind: 'import';
  /** Import statements behind the dependency. */
  weight: number;
  /** Up to `MAX_EXAMPLES`, sorted by file and line. */
  examples: Source[];
  source: Source;
  confidence: Confidence;
}

export interface ScanExternal {
  /** `<ecosystem>:<name>`. */
  id: string;
  name: string;
  ecosystem: string;
  importedBy: string[];
  weight: number;
  examples: Source[];
  source: Source;
  /** `extracted` when a manifest declares it; `inferred` when only an import names it. */
  confidence: Confidence;
}

export interface ScanColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  uk?: boolean;
  optional?: boolean;
}

export interface ScanRelation {
  /** `<table>#<column>`. */
  from: string;
  to: string;
  /** `[from side, to side]`, for example `["0..*", "1"]`. */
  cardinality: [string, string];
  confidence: Confidence;
}

export interface ScanTable {
  id: string;
  name: string;
  /** Extractor that found it: `prisma`, `sql`, `drizzle`, `django`, `sqlalchemy`. */
  origin: string;
  unit: string;
  columns: ScanColumn[];
  relations: ScanRelation[];
  source: Source;
  confidence: Confidence;
}

export interface LanguageCount {
  language: string;
  files: number;
}

export interface ScanLimits {
  maxFiles: number;
  /** Files listed after exclusions, up to `maxFiles`. */
  files: number;
  /** `true` when the listing stopped at `maxFiles`. */
  truncated: boolean;
  /** Source files over the size cap, counted in their unit but not parsed. */
  largeFilesSkipped: number;
  /** Imports that name neither a file, a unit nor a package (aliases, absolute paths, URLs). */
  unresolvedImports: number;
  /** Languages found in the repo whose imports this version does not read. */
  languagesWithoutImports: LanguageCount[];
}

export interface ScanDraft {
  schema: typeof SCAN_DRAFT_SCHEMA;
  /** Always `.`: every path in the draft is relative to the scanned folder. */
  root: '.';
  /** `HEAD` of the enclosing git repo, or `null` outside one. */
  commit: string | null;
  /** Scanner version. */
  scanner: string;
  limits: ScanLimits;
  units: ScanUnit[];
  dependencies: ScanDependency[];
  externals: ScanExternal[];
  tables: ScanTable[];
}
