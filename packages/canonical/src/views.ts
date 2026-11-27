/** Pure resolution of Views. A View only selects Nodes of the Model, it never defines entities. */
import type { Edge, Endpoint, CanonicalForm, Node, NodeOverride, Step, View } from './schema';
import { plannedEdge, plannedSets } from './planned';
import type { PlannedSets } from './planned';
import { resolveSequence } from './sequence';
import type { ResolvedInteraction } from './sequence';

/** Visible Node: a Collapsed group is shown as a single Node with its counter. */
export interface ResolvedNode extends Omit<Node, 'children'> {
  /** Only the visible children; empty in a Collapsed group. */
  children: ResolvedNode[];
  /** A Node without children is never collapsed. */
  collapsed: boolean;
  /** `label` from the View override or, otherwise, `title`. */
  label: string;
  /** Palette name: the one from the View override or, otherwise, the Node kind's. */
  color?: string;
  /** Opaque key of the Node kind; resolved by the `IconProvider`. */
  icon?: string;
  /** Direct children of the Node in the Model (visible or not). */
  childCount: number;
  /** View it links to (Drill-down); a Group with `link` does not expand. */
  link?: string;
  /** Effective Planned (ADR 0011): marked or under a marked Group. Its `attributes` carry only their own mark. */
  planned?: boolean;
}

/**
 * Visible Edge; `count` is how many Model Edges it represents (more than one if they were merged). `planned` is the
 * effective one (marked or with a planned end); a merged one is only if all those it groups are.
 */
export interface ResolvedEdge extends Edge {
  count: number;
}

/** Sequence Step: time cut at the projected Message whose `path` is `cut`, inclusive. */
export interface ResolvedStep extends Step {
  cut: string;
}

export interface GraphView {
  /** Picks the layout algorithm and goes into the cache keys. */
  type: 'architecture' | 'flow' | 'er';
  /** Visible Nodes in document order. */
  nodes: ResolvedNode[];
  /** Edges between visible Nodes, with those of a Collapsed group's children lifted to it. */
  edges: ResolvedEdge[];
  /** As in the View; the Pins come from here. */
  overrides: NodeOverride[];
  /** As in the View; `revealAt` interprets them. */
  steps: Step[];
}

/** No Edges or Pins: the sequence layout is deterministic and `order` gives the column order. */
export interface SequenceView {
  type: 'sequence';
  /** Lifelines in column order, without children. */
  nodes: ResolvedNode[];
  /** The projected Interaction; empty (no Messages) if the View names one that does not exist (`validate` reports it). */
  interaction: ResolvedInteraction;
  steps: ResolvedStep[];
}

export type ResolvedView = GraphView | SequenceView;

/** Collapse state from the caller (e.g. the shell); wins over what the View declares. */
export interface CollapseState {
  expanded?: readonly string[];
  collapsed?: readonly string[];
}

/**
 * `include` (`a` a Node, `a.*` direct children, `a.**` descendants, `*` roots, `**` everything) minus `exclude`;
 * `undefined` if the View does not exist. A selector without matches is not an error, and `exclude` does not drag
 * descendants. `color` is a Palette name; the Theme supplies the literal value.
 *
 * A Group with `link` is always collapsed; otherwise precedence decides: `state`, then the View's `collapsed`/`expanded`
 * and then `depth` (level >= `depth` opens collapsed; roots are level 1; `depth 0` shows nothing).
 * Under a Collapsed group nothing is visible: the Edges of its descendants are lifted to the Group and merged by
 * pair of ends (the lifted Attribute is lost; those internal to the Group disappear).
 */
export function resolveView(
  source: CanonicalForm,
  viewId: string,
  state: CollapseState = {},
): ResolvedView | undefined {
  const view = source.views.find((candidate) => candidate.id === viewId);
  if (view === undefined) return undefined;

  const all = flatten(source.model.nodes);
  const selected = (selectors: readonly string[]): Set<string> =>
    new Set(all.filter((node) => selectors.some((selector) => matchesSelector(selector, node.id))).map((node) => node.id));
  const included = selected(view.include);
  const excluded = selected(view.exclude);

  const collapsedHere = (node: Node): boolean => isCollapsed(node, view, state);
  const collapsedAncestor = new Map<string, string>();
  const record = (nodes: readonly Node[], inherited: string | undefined): void => {
    for (const node of nodes) {
      if (inherited !== undefined) collapsedAncestor.set(node.id, inherited);
      record(node.children, inherited ?? (collapsedHere(node) ? node.id : undefined));
    }
  };
  record(source.model.nodes, undefined);

  const visible = new Set(
    all
      .map((node) => node.id)
      .filter((id) => included.has(id) && !excluded.has(id) && !collapsedAncestor.has(id) && view.depth !== 0),
  );
  const overrides = new Map(view.overrides.map((override) => [override.node, override]));
  const typeColor = new Map(source.specification.nodeTypes.map((kind) => [kind.name, kind.color]));
  const typeIcon = new Map(source.specification.nodeTypes.map((kind) => [kind.name, kind.icon]));
  const links = new Map(view.links.map(({ node, view }) => [node, view]));
  const planned = plannedSets(source.model);
  const resolve = (node: Node): ResolvedNode => {
    const { children, planned: _mark, ...rest } = node;
    const link = links.get(node.id);
    const override = overrides.get(node.id);
    const color = override?.color ?? typeColor.get(node.type);
    const icon = typeIcon.get(node.type);
    return {
      ...rest,
      label: override?.label ?? node.title,
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      children: children.filter((child) => visible.has(child.id)).map(resolve),
      collapsed: collapsedHere(node),
      childCount: children.length,
      ...(link !== undefined && { link }),
      ...(planned.nodes.has(node.id) && { planned: true }),
    };
  };

  if (view.type === 'sequence') {
    const { nodes, interaction } = resolveSequence(source.model.interactions, source.model.nodes, view, excluded, resolve, collapsedAncestor, planned);
    return { type: view.type, nodes, interaction, steps: sequenceSteps(view, interaction) };
  }

  return {
    type: view.type,
    nodes: all.filter((node) => visible.has(node.id)).map(resolve),
    edges: liftEdges(source.model.edges, visible, collapsedAncestor, planned),
    overrides: view.overrides,
    steps: view.steps,
  };
}

/**
 * A Step whose `upto` does not exist or is not projected is skipped (`validate` reports it). `steps each` gives one Step per
 * projected Message, titled with its label without the `autonumber` number, or `from -> to`.
 */
function sequenceSteps(view: View, interaction: ResolvedInteraction): ResolvedStep[] {
  const messages = interaction.messages;
  if (view.stepsEach === true && view.steps.length === 0) {
    return messages.map((message) => {
      const label = message.number === undefined ? message.label : message.label?.slice(`${message.number}. `.length);
      return { title: label !== undefined && label !== '' ? label : `${message.from} -> ${message.to}`, show: [], hide: [], cut: message.path };
    });
  }
  return view.steps.flatMap((step): ResolvedStep[] => {
    const message = step.upto === undefined ? undefined : messages.find((m) => m.id === step.upto);
    return message === undefined ? [] : [{ ...step, cut: message.path }];
  });
}

function isCollapsed(node: Node, view: View, state: CollapseState): boolean {
  if (node.children.length === 0) return false;
  if (view.links.some((link) => link.node === node.id)) return true;
  if (state.expanded?.includes(node.id)) return false;
  if (state.collapsed?.includes(node.id)) return true;
  if (view.expanded.includes(node.id)) return false;
  if (view.collapsed.includes(node.id)) return true;
  return view.depth !== undefined && level(node.id) >= view.depth;
}

/** Those left with both ends in the same Group are dropped; those repeating a pair are merged adding up `count`. */
function liftEdges(
  edges: readonly Edge[],
  visible: ReadonlySet<string>,
  collapsedAncestor: ReadonlyMap<string, string>,
  planned: PlannedSets,
): ResolvedEdge[] {
  const merged = new Map<string, ResolvedEdge>();
  for (const original of edges) {
    const { planned: _mark, ...unmarked } = original;
    const edge: Edge = { ...unmarked, ...(plannedEdge(original, planned) && { planned: true }) };
    const from = lift(edge.from, collapsedAncestor);
    const to = lift(edge.to, collapsedAncestor);
    if (!visible.has(from.node) || !visible.has(to.node)) continue;
    if (from.node === to.node && (from !== edge.from || to !== edge.to)) continue;

    const key = JSON.stringify([from, to]);
    const previous = merged.get(key);
    if (previous === undefined) {
      merged.set(key, { ...edge, from, to, count: 1 });
    } else {
      const { fromCardinality, toCardinality, label, identifying, planned, ...withoutCardinality } = previous;
      // A merged line is identifying (or planned) only if all the Edges it groups are.
      merged.set(key, {
        ...withoutCardinality,
        ...(identifying === true && edge.identifying === true && { identifying }),
        ...(planned === true && edge.planned === true && { planned }),
        count: previous.count + 1,
      });
    }
  }
  return [...merged.values()];
}

function lift(endpoint: Endpoint, collapsedAncestor: ReadonlyMap<string, string>): Endpoint {
  const group = collapsedAncestor.get(endpoint.node);
  return group === undefined ? endpoint : { node: group };
}

/** In document order. */
function flatten(nodes: readonly Node[]): Node[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function level(id: string): number {
  return id.split('.').length;
}

export function matchesSelector(selector: string, id: string): boolean {
  if (selector === '**') return true;
  if (selector === '*') return level(id) === 1;
  if (selector.endsWith('.**')) return id.startsWith(selector.slice(0, -2));
  if (selector.endsWith('.*')) {
    const prefix = selector.slice(0, -1);
    return id.startsWith(prefix) && level(id) === level(selector);
  }
  return id === selector;
}
