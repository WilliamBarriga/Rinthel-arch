/**
 * Projection of the Diff onto the page, without DOM: what is highlighted on the canvas of the active View, which Views
 * are marked in the index and which Themes in the gallery. The browser does not recompute the Diff: it gets it from `dev`.
 * Invariants: an element inside a collapsed Group goes up to the Group (and its Edge, to the raised one); one hidden in
 * the current Step is not highlighted and marks the active View in the index; outside the active View it marks the Views
 * that show it. The `Highlight` is a value: bursts merge and each touched element restarts its time; what was removed
 * lasts until the next external Diff; the index clears when the View is visited; the gallery, when it is seen.
 */
import { elementKey, edgeId, sequenceElementId, parentOf, resolveView, revealAt } from 'canonical';
import type { CollapseState, CanonicalForm, ResolvedNode, ResolvedView } from 'canonical';

import type { DevDiff, DiffElement } from '../../src/protocol';

export interface ProjectionContext {
  /** Active View. */
  view: string;
  /** Current collapse state of the active View (the one in the hash). */
  state?: CollapseState;
  /** Current Step of the active View; without it, visibility by Steps is not checked. */
  step?: number;
}

export interface DiffProjection {
  /** Canvas ids (Node, Group, Edge or Message) to highlight, without repeats. */
  canvas: string[];
  /** Views marked in the index, in declaration order. */
  index: string[];
  /** Changed Themes (added or changed), for the gallery. */
  themes: string[];
  /** The Theme of the active View, if it changed. */
  viewTheme: string | undefined;
  /** Views the Diff touches (the active one included), in declaration order. */
  views: string[];
}

const visible = (nodes: readonly ResolvedNode[]): Map<string, ResolvedNode> => {
  const map = new Map<string, ResolvedNode>();
  const traverse = (list: readonly ResolvedNode[]): void => {
    for (const n of list) {
      map.set(n.id, n);
      traverse(n.children);
    }
  };
  traverse(nodes);
  return map;
};

/** The Node as seen in the View: itself, or the collapsed Group that contains it; `undefined` if it is not visible. */
function representative(map: Map<string, ResolvedNode>, id: string): string | undefined {
  if (map.has(id)) return id;
  for (let parent = parentOf(id); parent !== ''; parent = parentOf(parent)) {
    const group = map.get(parent);
    if (group !== undefined) return group.collapsed ? group.id : undefined;
  }
  return undefined;
}

/** Id of the element on the canvas of the resolved View, or `undefined` if it is not in it. */
function idInView(element: DiffElement, resolved: ResolvedView): string | undefined {
  const map = visible(resolved.nodes);
  switch (element.kind) {
    case 'node':
      return representative(map, element.id);
    case 'attribute':
      return representative(map, element.node);
    case 'edge': {
      if (resolved.type === 'sequence') return undefined;
      const from = representative(map, element.from);
      const to = representative(map, element.to);
      const ofPair = resolved.edges.filter((a) => a.from.node === from && a.to.node === to);
      // Not raised, the ordinal is that of the Edge between those Nodes; raised to a collapsed Group, they are all the same.
      const raised = from !== element.from || to !== element.to;
      const edge = raised ? ofPair[0] : ofPair[element.ordinal];
      return edge === undefined ? undefined : edgeId(edge);
    }
    case 'message': {
      if (resolved.type !== 'sequence' || resolved.interaction.id !== element.interaction) return undefined;
      const message = resolved.interaction.messages.find((m) => m.path === element.path);
      return message === undefined ? undefined : sequenceElementId(element.interaction, message.path);
    }
    default:
      return undefined;
  }
}

/** Views that show the element without it being on the canvas (Interaction, View); `undefined` if projected by id. */
function viewsWithoutCanvas(element: DiffElement, source: CanonicalForm): string[] | undefined {
  if (element.kind === 'interaction') return source.views.filter((v) => v.type === 'sequence' && v.interaction === element.id).map((v) => v.id);
  if (element.kind === 'view') return source.views.some((v) => v.id === element.id) ? [element.id] : [];
  if (element.kind === 'theme') return [];
  return undefined;
}

/**
 * The Theme the View is drawn with: the one it declares or, without `theme`, `neutral` (the Source's first if absent).
 * The Source carries the Themes already resolved (`extends` chain flattened): a change in a parent arrives as a change
 * of the child.
 */
const effectiveTheme = (source: CanonicalForm, view: string): string | undefined => {
  const declared = source.views.find((v) => v.id === view)?.theme ?? 'neutral';
  return source.themes.some((t) => t.name === declared) ? declared : source.themes[0]?.name;
};

/** `elements`: what was added and changed (what was removed is not projected: it is listed). */
export function projectDiff(elements: readonly DiffElement[], source: CanonicalForm, context: ProjectionContext): DiffProjection {
  const { view: active, state, step } = context;
  const resolved = new Map<string, ResolvedView | undefined>();
  const resolve = (view: string): ResolvedView | undefined => {
    if (!resolved.has(view)) resolved.set(view, resolveView(source, view, view === active ? state : undefined));
    return resolved.get(view);
  };
  const resolvedActive = resolve(active);
  const visibility = resolvedActive === undefined || step === undefined ? undefined : revealAt(resolvedActive, step);

  const canvas = new Set<string>();
  const touched = new Set<string>();
  const marked = new Set<string>();
  const themes = new Set<string>();
  for (const element of elements) {
    if (element.kind === 'theme') themes.add(element.name);
    const withoutCanvas = viewsWithoutCanvas(element, source);
    if (withoutCanvas !== undefined) {
      for (const v of withoutCanvas) {
        touched.add(v);
        if (v !== active) marked.add(v);
      }
      continue;
    }
    for (const { id: view } of source.views) {
      const resolved = resolve(view);
      const id = resolved === undefined ? undefined : idInView(element, resolved);
      if (id === undefined) continue;
      touched.add(view);
      if (view !== active) marked.add(view);
      else if (visibility !== undefined && visibility(id) === 0) marked.add(view);
      else canvas.add(id);
    }
  }
  const inOrder = (set: Set<string>): string[] => source.views.map((v) => v.id).filter((v) => set.has(v));
  const activeTheme = effectiveTheme(source, active);
  return { canvas: [...canvas], index: inOrder(marked), themes: [...themes], viewTheme: activeTheme !== undefined && themes.has(activeTheme) ? activeTheme : undefined, views: inOrder(touched) };
}

/** What a Diff added and changed: what is projected. */
export const touchedOf = (diff: Pick<DevDiff, 'agregados' | 'cambiados'>): DiffElement[] => [...diff.agregados, ...diff.cambiados.map((c) => c.elemento)];

/** What the page remembers of the external Diffs. */
export interface Highlight {
  /** Elements highlighted on the canvas and until when (ms); projected onto the active View when drawing. */
  canvas: { element: DiffElement; to: number }[];
  /** Views marked in the index until visited. */
  index: string[];
  /** Themes marked in the gallery until it is seen. */
  themes: string[];
  /** What the last external Diff removed. */
  removed: DiffElement[];
  /** Theme of the active View changed by the last merged Diff (to notify in the frame). */
  viewTheme?: string;
}

export const EMPTY_HIGHLIGHT: Highlight = { canvas: [], index: [], themes: [], removed: [] };

/** Default duration of the canvas highlight (set by the chrome, not by the contract). */
export const HIGHLIGHT_DURATION_MS = 5000;

/** Merges an external Diff: each touched element restarts its time, the index and the gallery accumulate, the removed list is replaced. */
export function mergeDiff(highlight: Highlight, diff: DevDiff, options: ProjectionContext & { source: CanonicalForm; now: number; durationMs: number }): Highlight {
  const { source, now, durationMs, ...context } = options;
  const touched = touchedOf(diff);
  const p = projectDiff(touched, source, context);
  const fresh = new Map(touched.filter((e) => e.kind !== 'theme' && e.kind !== 'view' && e.kind !== 'interaction').map((e) => [elementKey(e), e]));
  const withoutRenewing = highlight.canvas.filter(({ element }) => !fresh.has(elementKey(element)));
  const withoutRepeating = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];
  const { viewTheme: _previous, ...rest } = highlight;
  return {
    ...rest,
    canvas: [...withoutRenewing, ...[...fresh.values()].map((element) => ({ element, to: now + durationMs }))],
    index: withoutRepeating(highlight.index, p.index),
    themes: withoutRepeating(highlight.themes, p.themes),
    removed: diff.quitados,
    ...(p.viewTheme !== undefined && { viewTheme: p.viewTheme }),
  };
}

/** Removes from the canvas what expired at `now`. */
export function expireHighlight(highlight: Highlight, now: number): Highlight {
  const canvas = highlight.canvas.filter((e) => e.to > now);
  return canvas.length === highlight.canvas.length ? highlight : { ...highlight, canvas };
}

/** Visiting a View removes its mark from the index. */
export function visitView(highlight: Highlight, view: string): Highlight {
  return highlight.index.includes(view) ? { ...highlight, index: highlight.index.filter((v) => v !== view) } : highlight;
}

/** Seeing the gallery removes the Theme marks. */
export const viewGallery = (highlight: Highlight): Highlight => (highlight.themes.length === 0 ? highlight : { ...highlight, themes: [] });
