/**
 * What `diagrams scan` needs to refresh a Workspace without knowing the core (ADR 0010, "incremental refresh"):
 * matching ids against `.rinthel/scan-ignore` and the changes between two drafts.
 */
import ignore from 'ignore';

import type { ScanDraft } from './draft';
import { byCodeUnit } from './files';

/**
 * Matcher for gitignore-style `patterns` (the text of `.rinthel/scan-ignore`) over unit and table ids. The root unit
 * `.` matches only a `.` line; an id that is not a relative path (`../x`, `/x`) never matches.
 */
export function idMatcher(patterns: string): (id: string) => boolean {
  const matcher = ignore().add(patterns);
  const root = patterns.split(/\r?\n/).some((line) => line.trim() === '.');
  return (id) => {
    if (id === '.') return root;
    try {
      return matcher.ignores(id);
    } catch {
      return false;
    }
  };
}

/** Ids only in the current draft (`added`) and only in the previous one (`removed`), sorted. */
export interface IdChanges {
  added: string[];
  removed: string[];
}

export interface DraftChanges {
  commits: { previous: string | null; current: string | null };
  units: IdChanges;
  dependencies: IdChanges;
  externals: IdChanges;
  tables: IdChanges;
  /** `<table id>#<column>` of tables in both drafts; an added or removed table does not list its columns. */
  columns: IdChanges;
}

/**
 * What changed from `previous` to `current`, by id. A table whose id changed (a second table with the same name
 * qualifies both ids) shows up as removed and added.
 */
export function diffDrafts(previous: ScanDraft, current: ScanDraft): DraftChanges {
  const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);
  const inBoth = new Set(ids(previous.tables).filter((id) => current.tables.some((table) => table.id === id)));
  const columns = (draft: ScanDraft): string[] =>
    draft.tables.filter((table) => inBoth.has(table.id)).flatMap((table) => table.columns.map((column) => `${table.id}#${column.name}`));
  return {
    commits: { previous: previous.commit, current: current.commit },
    units: changes(ids(previous.units), ids(current.units)),
    dependencies: changes(ids(previous.dependencies), ids(current.dependencies)),
    externals: changes(ids(previous.externals), ids(current.externals)),
    tables: changes(ids(previous.tables), ids(current.tables)),
    columns: changes(columns(previous), columns(current)),
  };
}

function changes(before: readonly string[], after: readonly string[]): IdChanges {
  const was = new Set(before);
  const is = new Set(after);
  return {
    added: after.filter((id) => !was.has(id)).sort(byCodeUnit),
    removed: before.filter((id) => !is.has(id)).sort(byCodeUnit),
  };
}
