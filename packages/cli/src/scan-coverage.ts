/**
 * Scan coverage (ADR 0010, "incremental refresh" amendment): the Scan draft against the compiled Model of a Workspace,
 * matched only by Source `{kind "path", ref <draft id>}`. Informative: it never fails `scan` and never becomes an Issue.
 */
import { join } from 'node:path';

import { plannedSets } from 'canonical';
import type { Attribute, Model, Node, ScanCoverage, ScanCoverageNotice } from 'canonical';
import { EXCLUDED_FOLDERS, byCodeUnit } from 'scanner';
import type { ScanDraft, ScanTable } from 'scanner';

import { abrirSesionDe } from './sesion-cli';
import { leerWorkspace, rutasDeDg } from './workspace';

/** Its shape is the `coverage` of the `scan --json` contract (`scanSummarySchema` in `canonical`). */
export type Coverage = ScanCoverage;
type CoverageCount = Coverage['units'];
type ColumnDifference = Coverage['columns'][number];

/** Coverage could not be computed: no single Workspace found, or it does not compile. */
export type CoverageNotice = ScanCoverageNotice;

/** Folder levels below the root searched for a Workspace (the root is level 0). */
export const WORKSPACE_SEARCH_DEPTH = 4;

/**
 * Where `scan` looks for a Workspace: `--workspace`, or the shallowest folder (the root included, down to
 * `WORKSPACE_SEARCH_DEPTH`, skipping hidden folders and `EXCLUDED_FOLDERS`) that holds `.dg` files. Two or more at that
 * depth give a notice instead of a guess; none gives `undefined` (no coverage).
 */
export function findWorkspace(root: string, explicit: string | undefined): { path: string } | CoverageNotice | undefined {
  if (explicit !== undefined) return { path: explicit };
  let files: string[];
  try {
    files = rutasDeDg(root, WORKSPACE_SEARCH_DEPTH, (name) => EXCLUDED_FOLDERS.has(name));
  } catch {
    return undefined;
  }
  const folders = [...new Set(files.map((file) => file.slice(0, Math.max(file.lastIndexOf('/'), 0))))];
  const depthOf = (folder: string): number => (folder === '' ? 0 : folder.split('/').length);
  const shallowest = Math.min(...folders.map(depthOf));
  const found = folders.filter((folder) => depthOf(folder) === shallowest).sort(byCodeUnit);
  if (found.length === 0) return undefined;
  if (found.length === 1) return { path: found[0] === '' ? root : join(root, found[0] as string) };
  return { workspace: null, error: `several Workspaces under the root (${found.join(', ')}); pass --workspace <path>` };
}

/** Compiles the Workspace (never runs its code) and compares it with the draft. */
export function coverageOf(draft: ScanDraft, workspace: string, ignores: (id: string) => boolean): Coverage | CoverageNotice {
  const opened = abrirSesionDe(leerWorkspace, workspace);
  if ('fallo' in opened) return { workspace, error: opened.fallo.stderr.trim() };
  const model = opened.sesion.source?.model;
  if (model === undefined) return { workspace, error: `the Workspace does not compile; run diagrams validate --workspace ${workspace}` };
  return compare(draft, model, workspace, ignores);
}

/** A Node as coverage sees it: its `path` refs and Attributes. */
interface CoverageNode {
  id: string;
  refs: string[];
  attributes: Attribute[];
}

/**
 * The Nodes and Attributes that take part in coverage. Planned-aware (ADR 0011): a planned Node (marked or under a
 * planned Group) is proposed code, so it never makes an orphan ref, and a planned Attribute (marked or of a planned
 * Node) is never extra.
 */
function coverageNodes(model: Model): CoverageNode[] {
  const nodes: CoverageNode[] = [];
  const planned = plannedSets(model);
  const visit = (node: Node): void => {
    const refs = node.source.filter((source) => source.kind === 'path').map((source) => source.ref);
    if (refs.length > 0 && !planned.nodes.has(node.id)) {
      nodes.push({ id: node.id, refs, attributes: node.attributes.filter((attribute) => !planned.attributes.has(`${node.id}#${attribute.name}`)) });
    }
    node.children.forEach(visit);
  };
  model.nodes.forEach(visit);
  return nodes;
}

function compare(draft: ScanDraft, model: Model, workspace: string, ignores: (id: string) => boolean): Coverage {
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
    orphanRefs: orphanRefs.sort((a, b) => byCodeUnit(a.node, b.node) || byCodeUnit(a.ref, b.ref)),
    columns,
    ignored: ignored.size,
  };
}

