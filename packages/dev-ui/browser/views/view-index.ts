/** View index, without DOM: grouped by Diagram type and with their Links (`link`) between Views. */
import { VIEW_TYPES } from 'canonical';
import type { CanonicalForm, View } from 'canonical';

export interface IndexEntry {
  id: string;
  kind: View['type'];
  /** Views this one links to (without repeats, in declaration order of the `link`s). */
  links: string[];
  /** Views that link to this one. */
  incoming: string[];
}

export interface IndexGroup {
  kind: View['type'];
  views: IndexEntry[];
}

/** Fixed order of the groups (`VIEW_TYPES`); types without Views are left out. */
export function viewIndex(source: CanonicalForm): IndexGroup[] {
  const existing = new Set(source.views.map((v) => v.id));
  const linksOf = (view: View): string[] => [...new Set(view.links.map((l) => l.view).filter((v) => existing.has(v) && v !== view.id))];
  const outgoing = new Map(source.views.map((v) => [v.id, linksOf(v)]));
  const entry = (view: View): IndexEntry => ({
    id: view.id,
    kind: view.type,
    links: outgoing.get(view.id) ?? [],
    incoming: source.views.filter((other) => outgoing.get(other.id)?.includes(view.id) === true).map((other) => other.id),
  });
  return VIEW_TYPES.map((kind) => ({ kind, views: source.views.filter((v) => v.type === kind).map(entry) })).filter((g) => g.views.length > 0);
}

/** Index Views in the order the arrows traverse them. */
export const indexOrder = (groups: readonly IndexGroup[]): string[] => groups.flatMap((g) => g.views.map((v) => v.id));
