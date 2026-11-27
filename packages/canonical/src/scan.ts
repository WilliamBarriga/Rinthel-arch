/**
 * Zod schema of the `scan --json` summary (ADR 0005, ADR 0010): the source of truth of that contract. Its version is
 * independent of the draft's `schema` and of `validate`'s: adding fields keeps `SCAN_CONTRACT_VERSION`; removing them
 * or changing their meaning bumps it. The draft itself (`rinthel/scan@1`) is the Scanner's, not this.
 */
import { z } from 'zod';

export const SCAN_CONTRACT_VERSION = 1;

const count = z.number().int().nonnegative();

const coverageCountSchema = z.object({
  total: count,
  covered: count,
  /** Draft ids no Node cites, minus the ignored ones, sorted. */
  uncovered: z.array(z.string()),
});

/** The draft against a compiled Workspace, matched only by Source `path` refs. */
export const scanCoverageSchema = z.object({
  workspace: z.string(),
  units: coverageCountSchema,
  tables: coverageCountSchema,
  /** Source `path` refs that are not a unit, table or external id of the draft, by Node id. */
  orphanRefs: z.array(z.object({ node: z.string(), ref: z.string() })),
  /**
   * Per Node citing a table: `missing`, draft columns it has no Attribute for (column order); `extra`, its Attributes
   * no cited table has as a column (Attribute order).
   */
  columns: z.array(z.object({ node: z.string(), table: z.string(), missing: z.array(z.string()), extra: z.array(z.string()) })),
  /** Distinct ids left out by `.rinthel/scan-ignore`. */
  ignored: count,
});

/** Coverage could not be computed: no single Workspace found (`workspace: null`), or it does not compile. */
export const scanCoverageNoticeSchema = z.object({ workspace: z.string().nullable(), error: z.string() });

const idChangesSchema = z.object({ added: z.array(z.string()), removed: z.array(z.string()) });

/** Changes since the previous draft, which `scan` rotated to `previous`. */
export const scanChangesSchema = z.object({
  previous: z.string(),
  commits: z.object({ previous: z.string().nullable(), current: z.string().nullable() }),
  units: idChangesSchema,
  dependencies: idChangesSchema,
  externals: idChangesSchema,
  tables: idChangesSchema,
  /** `<table id>#<column>`. */
  columns: idChangesSchema,
});

export const scanSummarySchema = z.object({
  contractVersion: z.literal(SCAN_CONTRACT_VERSION),
  /** Path the draft was written to. */
  draft: z.string(),
  schema: z.string(),
  commit: z.string().nullable(),
  counts: z.object({ units: count, dependencies: count, externals: count, tables: count }),
  limits: z.object({
    maxFiles: count,
    files: count,
    truncated: z.boolean(),
    largeFilesSkipped: count,
    unresolvedImports: count,
    languagesWithoutImports: z.array(z.object({ language: z.string(), files: count })),
  }),
  /** The first rows of each section (the draft has them all). */
  units: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), files: count })),
  dependencies: z.array(z.object({ id: z.string(), from: z.string(), to: z.string(), weight: count })),
  externals: z.array(z.object({ id: z.string(), weight: count })),
  tables: z.array(z.object({ id: z.string(), name: z.string(), origin: z.string(), columns: count, relations: count })),
  /** `null` without a Workspace. */
  coverage: z.union([scanCoverageSchema, scanCoverageNoticeSchema]).nullable(),
  /** `null` without a previous draft. */
  changes: scanChangesSchema.nullable(),
  /** The next step, on one line. */
  next: z.string(),
});

export type ScanSummary = z.infer<typeof scanSummarySchema>;
export type ScanCoverage = z.infer<typeof scanCoverageSchema>;
export type ScanCoverageNotice = z.infer<typeof scanCoverageNoticeSchema>;
export type ScanChanges = z.infer<typeof scanChangesSchema>;
