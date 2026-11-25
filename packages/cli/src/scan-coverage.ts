/**
 * Scan coverage (ADR 0010, "incremental refresh" amendment): the Scan draft against the compiled Model of a Workspace,
 * matched only by Source `{kind "path", ref <draft id>}`. Informative: it never fails `scan` and never becomes an Issue.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { Atributo, Modelo, Nodo } from 'canonico';
import { EXCLUDED_FOLDERS } from 'scanner';
import type { ScanDraft, ScanTable } from 'scanner';

import { abrirSesionDe } from './sesion-cli';
import { leerWorkspace } from './workspace';

export interface CoverageCount {
  total: number;
  covered: number;
  /** Draft ids no Node cites, minus the ignored ones, sorted. */
  uncovered: string[];
}

export interface ColumnDifference {
  node: string;
  table: string;
  /** Draft columns the Node has no Attribute for, in column order. */
  missing: string[];
  /** Attributes of the Node that no cited table has as a column, in Attribute order. */
  extra: string[];
}

export interface Coverage {
  workspace: string;
  units: CoverageCount;
  tables: CoverageCount;
  /** Source `path` refs that are not a unit, table or external id of the draft, by Node id. */
  orphanRefs: { node: string; ref: string }[];
  columns: ColumnDifference[];
  /** Distinct ids left out by `.rinthel/scan-ignore`. */
  ignored: number;
}

/** Coverage could not be computed: no single Workspace found, or it does not compile. */
export interface CoverageNotice {
  workspace: string | null;
  error: string;
}

/** Folder levels below the root searched for a Workspace (the root is level 0). */
export const WORKSPACE_SEARCH_DEPTH = 4;

/**
 * Where `scan` looks for a Workspace: `--workspace`, or the shallowest folder (the root included, down to
 * `WORKSPACE_SEARCH_DEPTH`, skipping hidden folders and `EXCLUDED_FOLDERS`) that holds `.dg` files. Two or more at that
 * depth give a notice instead of a guess; none gives `undefined` (no coverage).
 */
export function findWorkspace(root: string, explicit: string | undefined): { path: string } | CoverageNotice | undefined {
  if (explicit !== undefined) return { path: explicit };
  let level = [root];
  for (let depth = 0; depth <= WORKSPACE_SEARCH_DEPTH && level.length > 0; depth++) {
    const found: string[] = [];
    const next: string[] = [];
    for (const folder of level) {
      let entries;
      try {
        entries = readdirSync(folder, { withFileTypes: true });
      } catch {
        continue;
      }
      if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.dg'))) found.push(folder);
      else {
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && !EXCLUDED_FOLDERS.has(entry.name)) next.push(join(folder, entry.name));
        }
      }
    }
    if (found.length === 1) return { path: found[0] as string };
    if (found.length > 1) {
      const names = found.map((folder) => relative(root, folder).split(sep).join('/')).sort();
      return { workspace: null, error: `several Workspaces under the root (${names.join(', ')}); pass --workspace <path>` };
    }
    level = next.sort();
  }
  return undefined;
}

/** Compiles the Workspace (never runs its code) and compares it with the draft. */
export function coverageOf(draft: ScanDraft, workspace: string, ignores: (id: string) => boolean): Coverage | CoverageNotice {
  const abierta = abrirSesionDe(leerWorkspace, workspace);
  if ('fallo' in abierta) return { workspace, error: abierta.fallo.stderr.trim() };
  const model = abierta.sesion.fuente?.model;
  if (model === undefined) return { workspace, error: `the Workspace does not compile; run diagrams validate --workspace ${workspace}` };
  return compare(draft, model, workspace, ignores);
}

/** A Node as coverage sees it: its `path` refs and Attributes. */
interface CoverageNode {
  id: string;
  refs: string[];
  attributes: Atributo[];
}

/**
 * The Nodes and Attributes that take part in coverage. Planned-aware filtering (#242) goes here: a planned Node never
 * makes an orphan ref and a planned Attribute is never extra.
 */
function coverageNodes(model: Modelo): CoverageNode[] {
  const nodes: CoverageNode[] = [];
  const visit = (node: Nodo): void => {
    const refs = node.source.filter((source) => source.kind === 'path').map((source) => source.ref);
    if (refs.length > 0) nodes.push({ id: node.id, refs, attributes: node.attributes });
    node.children.forEach(visit);
  };
  model.nodes.forEach(visit);
  return nodes;
}

function compare(draft: ScanDraft, model: Modelo, workspace: string, ignores: (id: string) => boolean): Coverage {
  const units = new Set(draft.units.map((unit) => unit.id));
  const tables = new Map(draft.tables.map((table) => [table.id, table]));
  const externals = new Set(draft.externals.map((external) => external.id));
  const cited = new Set<string>();
  const orphanRefs: Coverage['orphanRefs'] = [];
  const columns: ColumnDifference[] = [];
  const ignored = new Set<string>();
  const kept = (id: string): boolean => {
    if (!ignores(id)) return true;
    ignored.add(id);
    return false;
  };

  for (const node of coverageNodes(model)) {
    const citedTables: ScanTable[] = [];
    for (const ref of node.refs) {
      cited.add(ref);
      const table = tables.get(ref);
      if (table !== undefined) {
        if (kept(table.id)) citedTables.push(table);
      } else if (!units.has(ref) && !externals.has(ref) && kept(ref)) {
        orphanRefs.push({ node: node.id, ref });
      }
    }
    // A Node citing several tables merges them: an Attribute is extra only if no cited table has that column.
    const attributes = new Set(node.attributes.map((attribute) => attribute.name));
    const inTables = new Set(citedTables.flatMap((table) => table.columns.map((column) => column.name)));
    citedTables.forEach((table, index) => {
      const missing = table.columns.map((column) => column.name).filter((name) => !attributes.has(name));
      const extra = index === 0 ? node.attributes.map((attribute) => attribute.name).filter((name) => !inTables.has(name)) : [];
      if (missing.length > 0 || extra.length > 0) columns.push({ node: node.id, table: table.id, missing, extra });
    });
  }

  const count = (ids: string[]): CoverageCount => {
    const uncovered = ids.filter((id) => !cited.has(id)).filter(kept);
    return { total: ids.length, covered: ids.filter((id) => cited.has(id)).length, uncovered };
  };
  return {
    workspace,
    units: count(draft.units.map((unit) => unit.id)),
    tables: count(draft.tables.map((table) => table.id)),
    orphanRefs: orphanRefs.sort((a, b) => compareIds(a.node, b.node) || compareIds(a.ref, b.ref)),
    columns,
    ignored: ignored.size,
  };
}

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
