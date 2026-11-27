/** Group collapse and expansion: pure functions without DOM. */
import type { CollapseState, ResolvedNode, ResolvedView } from 'canonical';

export const MAX_VISIBLE_NODES = 1000;

export function findNode(view: ResolvedView, id: string): ResolvedNode | undefined {
  const find = (nodes: readonly ResolvedNode[]): ResolvedNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = find(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return find(view.nodes);
}

/** Counts the View's visible Nodes, nested ones included. */
export function countVisibleNodes(view: ResolvedView): number {
  const count = (nodes: readonly ResolvedNode[]): number => nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
  return count(view.nodes);
}

/**
 * State that results from toggling Group `id`: a closed Group opens and an
 * open one closes. `undefined` if it is not toggleable (not in the View, not
 * a Group, or it has a `link`). Does not mutate `state`.
 */
export function toggleGroup(state: CollapseState, view: ResolvedView, id: string): CollapseState | undefined {
  const node = findNode(view, id);
  if (node === undefined || node.childCount === 0 || node.link !== undefined) return undefined;
  const without = (list: readonly string[] | undefined): string[] => (list ?? []).filter((x) => x !== id);
  return node.collapsed
    ? { expanded: [...without(state.expanded), id], collapsed: without(state.collapsed) }
    : { expanded: without(state.expanded), collapsed: [...without(state.collapsed), id] };
}
