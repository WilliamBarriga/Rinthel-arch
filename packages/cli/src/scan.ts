/**
 * `diagrams scan [<root>] [--out] [--json] [--depth] [--max-files]` (ADR 0010): runs the Scanner, writes the Scan draft
 * (default `<root>/.rinthel/scan.json`) and prints a compact summary that ends with the next step, or that summary as
 * JSON (`SCAN_CONTRACT_VERSION`). Exit codes as `validate`: 0 written, 2 usage or internal failure (nothing written).
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULT_DEPTH, DEFAULT_MAX_FILES, scan, serializeDraft } from 'scanner';
import type { ScanDraft } from 'scanner';

import { uso } from './sesion-cli';
import type { ResultadoDeEjecucion } from './sesion-cli';
import { escribirTexto } from './workspace';

/** Version of the `scan --json` summary; independent from the draft's `schema` and from `validate`'s. */
export const SCAN_CONTRACT_VERSION = 1;

/** Draft path inside the scanned root; `.rinthel/` is not versioned. */
export const DRAFT_PATH = '.rinthel/scan.json';

/** Rows per section of the summary; the draft on disk has everything. */
const SUMMARY_ROWS = 15;

const NEXT_STEP =
  'Next: read the draft and write the Workspace .dg files: a Node per unit worth showing, citing its unit id as a\n' +
  'Source path ref, then run diagrams validate --workspace <workspace>. Guide: skill rinthel-diagramas, "Import from code".';

/** Added to the next step when the draft has tables. */
const ER_STEP =
  'Tables: add an er View with a Node per table citing its table id as a Source path ref, its columns as Attributes\n' +
  '(pk fk uk, ? when optional) and its relations as Edges with their cardinality.';

export interface DependenciasDeScan {
  /** Creates missing folders. */
  escribirArchivo?: (ruta: string, texto: string) => void;
}

export async function comandoScan(
  args: readonly string[],
  { escribirArchivo = escribirTexto }: DependenciasDeScan,
): Promise<ResultadoDeEjecucion> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        out: { type: 'string' },
        json: { type: 'boolean', default: false },
        depth: { type: 'string' },
        'max-files': { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return uso((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) return uso(`scan takes one root folder; got ${positionals.join(', ')}`);
  const depth = integer(values.depth, DEFAULT_DEPTH, 0);
  if (depth === undefined) return uso('--depth must be an integer >= 0');
  const maxFiles = integer(values['max-files'], DEFAULT_MAX_FILES, 1);
  if (maxFiles === undefined) return uso('--max-files must be an integer >= 1');

  const root = positionals[0] ?? '.';
  const out = values.out ?? join(root, DRAFT_PATH);
  let draft: ScanDraft;
  try {
    draft = await scan(root, { depth, maxFiles });
  } catch (error) {
    return uso(`Could not scan '${root}': ${(error as Error).message}`);
  }
  try {
    escribirArchivo(out, serializeDraft(draft));
  } catch (error) {
    return uso(`Could not write '${out}': ${(error as Error).message}`);
  }
  const summary = summarize(draft, out);
  return { exitCode: 0, stdout: values.json ? `${JSON.stringify(summary)}\n` : text(summary), stderr: '' };
}

function integer(value: string | undefined, fallback: number, min: number): number | undefined {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && value.trim() !== '' ? number : undefined;
}

type Summary = ReturnType<typeof summarize>;

function summarize(draft: ScanDraft, out: string) {
  const units = [...draft.units].sort((a, b) => b.files - a.files || compare(a.id, b.id));
  const dependencies = [...draft.dependencies].sort((a, b) => b.weight - a.weight || compare(a.id, b.id));
  const externals = [...draft.externals].sort((a, b) => b.weight - a.weight || compare(a.id, b.id));
  return {
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
    next: nextStep(draft.tables.length).replaceAll('\n', ' '),
  };
}

function text(summary: Summary): string {
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
  lines.push('', nextStep(counts.tables), '');
  return lines.join('\n');
}

const nextStep = (tables: number): string => (tables > 0 ? `${NEXT_STEP}\n${ER_STEP}` : NEXT_STEP);

/** Left-aligned columns, two spaces apart, indented by two. */
function table(rows: string[][]): string[] {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  return rows.map((row) => `  ${row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? 0))).join('  ')}`);
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
