/** Path and keyboard focus, pure and without DOM: the `on-path`, `dimmed` and `focus` states `render` receives through `states`. */
import { edgeId, sequenceElementId } from 'canonical';
import type { ResolvedEdge, SequenceView, ResolvedView } from 'canonical';
import type { States, VisualState } from 'render';

export type FocusMove = 'siguiente' | 'anterior' | 'adelante' | 'atras';

/** Ids of the View's Nodes and Groups in Model order (preorder: a Group before its children). */
export const focusOrder = (view: ResolvedView): string[] => view.nodes.map((n) => n.id);

/**
 * Focus that results from a move. `siguiente`/`anterior` walk the Model order and return
 * `undefined` when leaving at an end (focus leaves the diagram). `adelante`/`atras` jump along an
 * outgoing/incoming Edge to the first neighbor in Model order; without a neighbor, focus does not change.
 * Without previous focus, any move lands on the first Node.
 */
export function moveFocus(view: ResolvedView, current: string | undefined, motion: FocusMove): string | undefined {
  const order = focusOrder(view);
  const i = current === undefined ? -1 : order.indexOf(current);
  if (i < 0) return order[0];
  if (motion === 'siguiente') return order[i + 1];
  if (motion === 'anterior') return order[i - 1];
  const neighbors = new Set(edgesOf(view).flatMap((a) => (motion === 'adelante' ? (a.from.node === current ? [a.to.node] : []) : a.to.node === current ? [a.from.node] : [])));
  return order.find((id) => neighbors.has(id)) ?? current;
}

/** Edges along which focus and path move; a sequence View has none. */
function edgesOf(view: ResolvedView): readonly ResolvedEdge[] {
  switch (view.type) {
    case 'sequence':
      return [];
    case 'architecture':
    case 'flow':
    case 'er':
      return view.edges;
  }
}

/** Neighbors of a Node: first those reachable in the direction of the Edges; with `withoutDirection`, in both. */
function neighbors(edges: readonly ResolvedEdge[], id: string, withoutDirection: boolean): string[] {
  return edges.flatMap((a) => (a.from.node === id ? [a.to.node] : withoutDirection && a.to.node === id ? [a.from.node] : []));
}

/** Shortest path of Nodes between `from` and `to` (both included), following the direction of the Edges and, if there is no way, without it; `undefined` if neither. */
export function shortestPath(view: ResolvedView, from: string, to: string): string[] | undefined {
  for (const withoutDirection of [false, true]) {
    const previous = new Map<string, string | undefined>([[from, undefined]]);
    const tail = [from];
    for (let c = 0; c < tail.length; c++) {
      const id = tail[c]!;
      if (id === to) break;
      for (const v of neighbors(edgesOf(view), id, withoutDirection)) {
        if (previous.has(v)) continue;
        previous.set(v, id);
        tail.push(v);
      }
    }
    if (!previous.has(to)) continue;
    const path: string[] = [];
    for (let id: string | undefined = to; id !== undefined; id = previous.get(id)) path.unshift(id);
    return path;
  }
  return undefined;
}

/**
 * States of a path: `on-path` on its Nodes and on the Edges joining consecutive Nodes, `dimmed`
 * on the rest of the View's Nodes and Edges. An empty path marks nothing.
 */
export function pathStates(view: ResolvedView, path: readonly string[]): States {
  if (path.length === 0) return {};
  const nodes = new Set(path);
  const onPath = (a: ResolvedEdge): boolean =>
    path.some((id, i) => {
      const nextValue = path[i + 1];
      return nextValue !== undefined && ((a.from.node === id && a.to.node === nextValue) || (a.from.node === nextValue && a.to.node === id));
    });
  const states: Record<string, readonly VisualState[]> = {};
  for (const n of view.nodes) states[n.id] = [nodes.has(n.id) ? 'on-path' : 'dimmed'];
  for (const a of edgesOf(view)) states[edgeId(a)] = [onPath(a) ? 'on-path' : 'dimmed'];
  return states;
}

/** Merges two state maps: the states of each id are concatenated (those of `base` first). */
export function mergeStates(base: States, extra: States): States {
  const ids = Object.keys(extra);
  if (ids.length === 0) return base;
  const joined: Record<string, readonly VisualState[]> = { ...base };
  for (const id of ids) joined[id] = [...(joined[id] ?? []), ...extra[id]!];
  return joined;
}

export type SequenceFocusMove = 'siguiente' | 'anterior' | 'izquierda' | 'derecha' | 'abajo' | 'arriba';

/** Id of each visible Message, in time order (`interaction:path`). */
const visibleMessages = (view: SequenceView, visible: (id: string) => boolean): string[] =>
  view.interaction.messages.map((m) => sequenceElementId(view.interaction.id, m.path)).filter(visible);

/**
 * Keyboard focus in sequence: `siguiente`/`anterior` (Tab) walk the visible Lifelines in column
 * order and return `undefined` when leaving at an end; `izquierda`/`derecha` move to the neighbor Lifeline (from a
 * Message, starting at its sender); `abajo`/`arriba` walk the visible Messages in time order (focus moves to the
 * Message). What a Step has not revealed (`visible` false) is skipped. Without previous focus, it lands on the first Lifeline.
 */
export function moveFocusInSequence(view: SequenceView, current: string | undefined, motion: SequenceFocusMove, visible: (id: string) => boolean = () => true): string | undefined {
  const lifelines = view.nodes.map((n) => n.id).filter(visible);
  const messages = visibleMessages(view, visible);
  const isMessage = current !== undefined && messages.includes(current);
  if (current === undefined || (!isMessage && !lifelines.includes(current))) return lifelines[0];
  if (motion === 'abajo' || motion === 'arriba') {
    const i = messages.indexOf(current);
    if (i < 0) return (motion === 'abajo' ? messages[0] : messages.at(-1)) ?? current;
    return messages[i + (motion === 'abajo' ? 1 : -1)] ?? current;
  }
  const own = isMessage ? view.interaction.messages.find((m) => sequenceElementId(view.interaction.id, m.path) === current)!.from : current;
  const i = lifelines.indexOf(own);
  if (motion === 'siguiente' || motion === 'anterior') return lifelines[i + (motion === 'siguiente' ? 1 : -1)];
  return lifelines[i + (motion === 'derecha' ? 1 : -1)] ?? own;
}
