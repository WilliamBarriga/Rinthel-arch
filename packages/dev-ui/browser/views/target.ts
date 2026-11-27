/**
 * Which View shows a Node, without DOM: shared by "follow the agent", the Finder and the Diff.
 * Invariants: "shows" means the resolved View (without collapse) contains the Node; the order is declaration order.
 */
import { resolveView } from 'canonical';
import type { CanonicalForm } from 'canonical';

interface WithChildren {
  id: string;
  children: readonly WithChildren[];
}

const includes = (nodes: readonly WithChildren[], id: string): boolean => nodes.some((n) => n.id === id || includes(n.children, id));

/** Whether the View `view` shows the Node `node`. */
export function sampleView(source: CanonicalForm, view: string, node: string): boolean {
  const resolved = resolveView(source, view);
  return resolved !== undefined && includes(resolved.nodes, node);
}

/** Views that show the Node, in declaration order. */
export const viewsThatShow = (source: CanonicalForm, node: string): string[] => source.views.filter((v) => sampleView(source, v.id, node)).map((v) => v.id);

export interface NodeTarget {
  view: string;
  /** Node to select in `view`. */
  selection: string;
}

/** The active View if it shows the Node; otherwise the first one that shows it. `undefined` if none does. */
export function nodeTarget(source: CanonicalForm, node: string, activeView: string | undefined): NodeTarget | undefined {
  if (activeView !== undefined && sampleView(source, activeView, node)) return { view: activeView, selection: node };
  const first = source.views.find((v) => sampleView(source, v.id, node));
  return first === undefined ? undefined : { view: first.id, selection: node };
}
