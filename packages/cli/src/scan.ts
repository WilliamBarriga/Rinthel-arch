/**
 * `diagrams scan [<root>] [--out] [--json] [--depth] [--max-files] [--workspace]` (ADR 0010): runs the Scanner, rotates
 * the previous draft to `scan.prev.json`, writes the Scan draft (default `<root>/.rinthel/scan.json`) and prints a compact
 * summary (changes since the previous draft, Scan coverage when there is a Workspace) that ends with the next step, or
 * that summary as JSON (`SCAN_CONTRACT_VERSION`). Exit codes as `validate`: 0 written (coverage gaps included), 2 usage
 * or internal failure (nothing written).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCAN_CONTRACT_VERSION, scanSummarySchema } from 'canonical';
import type { ScanChanges, ScanSummary } from 'canonical';
import { DEFAULT_DEPTH, DEFAULT_MAX_FILES, SCAN_DRAFT_SCHEMA, byCodeUnit, diffDrafts, idMatcher, scan, serializeDraft } from 'scanner';
import type { ScanDraft } from 'scanner';

import { coverageOf, findWorkspace } from './scan-coverage';
import type { Coverage, CoverageNotice } from './scan-coverage';
import { usage } from './cli-session';
import type { RunResult } from './cli-session';
import { writeTextFile } from './workspace';

export { SCAN_CONTRACT_VERSION };

/** Draft path inside the scanned root; `.rinthel/` is not versioned. */
export const DRAFT_PATH = '.rinthel/scan.json';

/** gitignore-style patterns over unit and table ids that coverage leaves out; versioned, unlike the draft. */
export const IGNORE_PATH = '.rinthel/scan-ignore';

/** Rows per section of the summary; the draft on disk has everything. */
const SUMMARY_ROWS = 15;

const NEXT_STEP =
  'Next: read the draft and write the Workspace .dg files: a Node per unit worth showing, citing its unit id as a\n' +
  'Source path ref, then run diagrams validate --workspace <workspace>. Guide: skill rinthel-diagramas, "Import from code".';

/** Added to the next step when the draft has tables. */
const ER_STEP =
  'Tables: add an er View with a Node per table citing its table id as a Source path ref, its columns as Attributes\n' +
  '(pk fk uk, ? when optional) and its relations as Edges with their cardinality.';

/** The next step when coverage was computed against a Workspace. */
const REFRESH_STEP =
  'Next: refresh the Workspace: cite the uncovered units and tables worth showing, re-point or remove orphan refs and\n' +
  'align Attributes with their columns; never rewrite what a covered Node says. Then run diagrams validate --workspace\n' +
  '<workspace>. Guide: skill rinthel-diagramas, "Refresh from code".';

/** The next step when coverage found no gaps. */
const UP_TO_DATE_STEP = 'Next: nothing to refresh; scan again after the code changes.';

/** The disk as `scan` sees it besides the Scanner and the Workspace: the draft it rotates and writes, and `scan-ignore`. */
export interface ScanDependencies {
  /** A text file, or `undefined` if it cannot be read. */
  readText?: (path: string) => string | undefined;
  /** Creates missing folders. */
  writeText?: (path: string, text: string) => void;
}

export async function scanCommand(
  args: readonly string[],
  { readText = readTextFile, writeText = writeTextFile }: ScanDependencies,
): Promise<RunResult> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        out: { type: 'string' },
        json: { type: 'boolean', default: false },
        depth: { type: 'string' },
        'max-files': { type: 'string' },
        workspace: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usage((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) return usage(`scan takes one root folder; got ${positionals.join(', ')}`);
  const depth = integer(values.depth, DEFAULT_DEPTH, 0);
  if (depth === undefined) return usage('--depth must be an integer >= 0');
  const maxFiles = integer(values['max-files'], DEFAULT_MAX_FILES, 1);
  if (maxFiles === undefined) return usage('--max-files must be an integer >= 1');

  const root = positionals[0] ?? '.';
  const out = values.out ?? join(root, DRAFT_PATH);
  let draft: ScanDraft;
  try {
    draft = await scan(root, { depth, maxFiles });
  } catch (error) {
    return usage(`Could not scan '${root}': ${(error as Error).message}`);
  }
  const previousPath = out.endsWith('.json') ? `${out.slice(0, -'.json'.length)}.prev.json` : `${out}.prev`;
  const previousText = readText(out);
  try {
    if (previousText !== undefined) writeText(previousPath, previousText);
    writeText(out, serializeDraft(draft));
  } catch (error) {
    return usage(`Could not write '${out}': ${(error as Error).message}`);
  }
  const previous = parseDraft(previousText);
  const changes = previous === undefined ? null : { previous: previousPath, ...diffDrafts(previous, draft) };
  const workspace = findWorkspace(root, values.workspace);
  const coverage =
    workspace === undefined || 'error' in workspace ? (workspace ?? null) : coverageOf(draft, workspace.path, idMatcher(readText(join(root, IGNORE_PATH)) ?? ''));
  const summary = summarize(draft, out, coverage, changes);
  return { exitCode: 0, stdout: values.json ? `${JSON.stringify(summary)}\n` : text(summary), stderr: '' };
}

function readTextFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** A previous draft of the same schema; anything else gives no changes. */
function parseDraft(text: string | undefined): ScanDraft | undefined {
  if (text === undefined) return undefined;
  try {
    const draft = JSON.parse(text) as ScanDraft;
    return draft.schema === SCAN_DRAFT_SCHEMA ? draft : undefined;
  } catch {
    return undefined;
  }
}

function integer(value: string | undefined, fallback: number, min: number): number | undefined {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && value.trim() !== '' ? number : undefined;
}

/** The `scan --json` object, checked against its contract. */
function summarize(draft: ScanDraft, out: string, coverage: Coverage | CoverageNotice | null, changes: ScanChanges | null): ScanSummary {
  const units = [...draft.units].sort((a, b) => b.files - a.files || byCodeUnit(a.id, b.id));
  const dependencies = [...draft.dependencies].sort((a, b) => b.weight - a.weight || byCodeUnit(a.id, b.id));
  const externals = [...draft.externals].sort((a, b) => b.weight - a.weight || byCodeUnit(a.id, b.id));
  return scanSummarySchema.parse({
    contractVersion: SCAN_CONTRACT_VERSION,
    draft: out,
    schema: draft.schema,
    commit: draft.commit,
    counts: {
      units: draft.units.length,
      dependencies: draft.dependencies.length,
      externals: draft.externals.length,
      tables: draft.tables.length,
    },
    limits: draft.limits,
    units: units.slice(0, SUMMARY_ROWS).map(({ id, name, kind, files }) => ({ id, name, kind, files })),
    dependencies: dependencies.slice(0, SUMMARY_ROWS).map(({ id, from, to, weight }) => ({ id, from, to, weight })),
    externals: externals.slice(0, SUMMARY_ROWS).map(({ id, weight }) => ({ id, weight })),
    tables: draft.tables
      .slice(0, SUMMARY_ROWS)
      .map(({ id, name, origin, columns, relations }) => ({ id, name, origin, columns: columns.length, relations: relations.length })),
    coverage,
    changes,
    next: nextStep(draft.tables.length, coverage).replaceAll('\n', ' '),
  });
}

function text(summary: ScanSummary): string {
  const { counts, limits } = summary;
  const lines = [
    `Scan draft written to ${summary.draft} (${summary.schema}, ${summary.commit === null ? 'no commit' : `commit ${summary.commit.slice(0, 12)}`}).`,
    `${plural(counts.units, 'unit')}, ${plural(counts.dependencies, 'dependency', 'dependencies')}, ` +
      `${plural(counts.externals, 'external')}, ${plural(counts.tables, 'table')} from ${plural(limits.files, 'file')}.`,
  ];
  const section = (title: string, total: number, rows: string[][]): void => {
    if (rows.length === 0) return;
    lines.push('', `${title}:`, ...table(rows));
    if (total > rows.length) lines.push(`  ... ${total - rows.length} more in the draft`);
  };
  section('Units (most files first)', counts.units, summary.units.map((unit) => [unit.id, unit.name, unit.kind, plural(unit.files, 'file')]));
  section('Dependencies (heaviest first)', counts.dependencies, summary.dependencies.map((dep) => [`${dep.from} -> ${dep.to}`, `weight ${dep.weight}`]));
  section('Externals (most imported first)', counts.externals, summary.externals.map((external) => [external.id, `weight ${external.weight}`]));
  section(
    'Tables (by id)',
    counts.tables,
    summary.tables.map((table) => [table.id, table.origin, plural(table.columns, 'column'), plural(table.relations, 'relation')]),
  );

  const notes = [
    ...(limits.truncated ? [`stopped at --max-files ${limits.maxFiles} (truncated)`] : []),
    ...(limits.languagesWithoutImports.length > 0
      ? [`imports not read for ${limits.languagesWithoutImports.map(({ language, files }) => `${language} (${plural(files, 'file')})`).join(', ')}`]
      : []),
    ...(limits.unresolvedImports > 0 ? [`${plural(limits.unresolvedImports, 'unresolved import')}`] : []),
    ...(limits.largeFilesSkipped > 0 ? [`${plural(limits.largeFilesSkipped, 'large file')} not parsed`] : []),
  ];
  if (notes.length > 0) lines.push('', `Limits: ${notes.join('; ')}.`);
  if (summary.changes !== null) lines.push('', ...changesText(summary.changes));
  if (summary.coverage !== null) lines.push('', ...coverageText(summary.coverage));
  lines.push('', nextStep(counts.tables, summary.coverage), '');
  return lines.join('\n');
}

function nextStep(tables: number, coverage: Coverage | CoverageNotice | null): string {
  if (coverage === null || 'error' in coverage) return tables > 0 ? `${NEXT_STEP}\n${ER_STEP}` : NEXT_STEP;
  return coverageGaps(coverage).length > 0 ? REFRESH_STEP : UP_TO_DATE_STEP;
}

/** One line per added (`+`) or removed (`-`) id, `SUMMARY_ROWS` at most; `--json` lists them all. */
function changesText(changes: ScanChanges): string[] {
  const commit = (sha: string | null): string => (sha === null ? 'no commit' : `commit ${sha.slice(0, 12)}`);
  const rows = (['units', 'dependencies', 'externals', 'tables', 'columns'] as const).flatMap((kind) => {
    const label = { units: 'unit', dependencies: 'dependency', externals: 'external', tables: 'table', columns: 'column' }[kind];
    const shown = (id: string): string => (kind === 'dependencies' ? id.replace('->', ' -> ') : id);
    return [...changes[kind].added.map((id) => ['+', label, shown(id)]), ...changes[kind].removed.map((id) => ['-', label, shown(id)])];
  });
  const since = `since the previous scan (${commit(changes.commits.previous)} -> ${commit(changes.commits.current)})`;
  if (rows.length === 0) return [`No changes ${since}.`];
  const lines = [`Changes ${since}:`, ...table(rows.slice(0, SUMMARY_ROWS)).map((line) => line.replace(/^ {2}([+-]) {2}/, '  $1 '))];
  if (rows.length > SUMMARY_ROWS) lines.push(`  ... ${rows.length - SUMMARY_ROWS} more (--json lists them all)`);
  return lines;
}

/** One line per gap, `SUMMARY_ROWS` at most; `--json` lists them all. */
function coverageText(coverage: Coverage | CoverageNotice): string[] {
  if ('error' in coverage) return [`Scan coverage${coverage.workspace === null ? '' : ` against ${coverage.workspace}`}: ${coverage.error}.`];
  const { units, tables } = coverage;
  const rows = coverageGaps(coverage);
  const ignored = coverage.ignored > 0 ? ` ${plural(coverage.ignored, 'id')} ignored by ${IGNORE_PATH}.` : '';
  const lines = [
    `Scan coverage against ${coverage.workspace}: ${units.covered} of ${plural(units.total, 'unit')} and ${tables.covered} of ` +
      `${plural(tables.total, 'table')} cited by a Node.${rows.length === 0 ? ' Nothing to refresh.' : ''}${ignored}`,
    ...table(rows.slice(0, SUMMARY_ROWS)),
  ];
  if (rows.length > SUMMARY_ROWS) lines.push(`  ... ${rows.length - SUMMARY_ROWS} more (--json lists them all)`);
  return lines;
}

/** One row per gap: uncovered units and tables, orphan refs, column differences. */
function coverageGaps(coverage: Coverage): string[][] {
  return [
    ...coverage.units.uncovered.map((id) => ['uncovered unit', id]),
    ...coverage.tables.uncovered.map((id) => ['uncovered table', id]),
    ...coverage.orphanRefs.map(({ node, ref }) => ['orphan ref', ref, `in Node ${node}`]),
    ...coverage.columns.map(({ node, table, missing, extra }) => [
      'columns',
      table,
      `in Node ${node}: ${[...(missing.length > 0 ? [`missing ${missing.join(', ')}`] : []), ...(extra.length > 0 ? [`extra ${extra.join(', ')}`] : [])].join('; ')}`,
    ]),
  ];
}

/** Left-aligned columns, two spaces apart, indented by two. */
function table(rows: string[][]): string[] {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  return rows.map((row) => `  ${row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? 0))).join('  ')}`);
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
