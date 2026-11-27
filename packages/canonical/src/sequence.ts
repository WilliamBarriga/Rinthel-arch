/**
 * Pure resolution of the Interaction of a `sequence` View and derivation of activations. A View projects
 * exactly one Interaction; its Lifelines are the participating Nodes, in `order` order and then by
 * first appearance.
 */
import type { NoteAnchor, Interaction, InteractionItem, Message, Node, FragmentOperator, MessageKind, View } from './schema';
import { plannedMessage, plannedSets } from './planned';
import type { PlannedSets } from './planned';
import type { ResolvedNode } from './views';

/** Message projected by a View; `path` is its identity (index path in the Interaction, `0.1.2` inside nested Fragments). */
export interface ResolvedMessage {
  path: string;
  /** Unique in its Interaction. */
  id?: string;
  kind: MessageKind;
  from: string;
  to: string;
  label?: string;
  /** Paths of the Fragments that contain it, outermost first; absent if it is at the Interaction level. */
  scope?: string[];
  /** `autonumber` number (already included in `label`); absent if the View does not number. */
  number?: number;
  /** Planned (ADR 0011): its Interaction or one of its Lifelines (before lifting it) is. */
  planned?: boolean;
}

/** `box` of an open Group; `lifelines` in column order, the Group's own (if it has one) first. */
export interface GroupBox {
  id: string;
  label: string;
  /** 0 is the outermost. */
  level: number;
  lifelines: string[];
}

/** Projected Fragment: `path` is its identity (item index, or `2.0.1` if it is inside operand 0 of item 2). */
export interface ResolvedFragment {
  type: 'fragment';
  path: string;
  operator: FragmentOperator;
  operands: { guard?: string; items: ResolvedItem[] }[];
}

/** Projected Note: `targets` are Lifelines of the View (those that are not are dropped). */
export interface ResolvedNote {
  type: 'note';
  path: string;
  anchor: NoteAnchor;
  targets: string[];
  text: string;
}

/**
 * Projected `ref`: a `ref` Fragment with the title of the referenced Interaction. `participants` are those of that
 * Interaction that are Lifelines of the View, in column order; empty if none are in common.
 */
export interface ResolvedRef {
  type: 'ref';
  path: string;
  interaction: string;
  title: string;
  participants: string[];
}

/** Projected item of an Interaction, in temporal order. */
export type ResolvedItem = { type: 'message'; message: ResolvedMessage } | ResolvedFragment | ResolvedNote | ResolvedRef;

/** Interaction as projected by a View: its Messages after `exclude`, in temporal order. */
export interface ResolvedInteraction {
  id: string;
  title: string;
  messages: ResolvedMessage[];
  /** The same Messages with their Fragments, as a tree. */
  items: ResolvedItem[];
  /** `box` of the open Groups with child Lifelines, outer ones before nested ones. */
  groups?: GroupBox[];
}

/**
 * A `sync` opens one on the receiver and the next `reply` from the receiver to the sender closes it (stack for nested ones).
 * `from`/`to` are indices in the Message list; `to` is `null` without `reply` (it lasts until the end of the
 * Interaction, or of its Fragment: see `closesAt`). `level`: depth in its Lifeline, 0 the outermost.
 */
export interface Activation {
  lifeline: string;
  from: number;
  to: number | null;
  level: number;
  /** Path of the Fragment whose end closes the activation of a `sync` without `reply` inside it. */
  closesAt?: string;
}

/**
 * Activations of a Message list and the indices of the `reply` that close none (no open `sync` from the
 * sender to the receiver). `async` opens no activation; a `sync` self Message opens a nested one on its Lifeline.
 */
export function activationsOf(messages: readonly (Pick<Message, 'kind' | 'from' | 'to'> & { scope?: readonly string[] })[]): { activations: Activation[]; looseReplies: number[] } {
  const activations: Activation[] = [];
  const open: Activation[] = [];
  const looseReplies: number[] = [];
  const callers = new Map<Activation, string>();
  const scopes = new Map<Activation, readonly string[]>();
  /** A `sync` without `reply` opened inside a Fragment ends when the flow leaves that Fragment. */
  const closeLeaving = (current: readonly string[]): void => {
    for (let i = open.length - 1; i >= 0; i--) {
      const scope = scopes.get(open[i]!)!;
      const last = scope.at(-1);
      if (last !== undefined && current[scope.length - 1] !== last) {
        open[i]!.closesAt = last;
        open.splice(i, 1);
      }
    }
  };
  messages.forEach((message, index) => {
    closeLeaving(message.scope ?? []);
    if (message.kind === 'sync') {
      const level = open.filter((a) => a.lifeline === message.to).length;
      const activation: Activation = { lifeline: message.to, from: index, to: null, level };
      callers.set(activation, message.from);
      scopes.set(activation, message.scope ?? []);
      open.push(activation);
      activations.push(activation);
    } else if (message.kind === 'reply') {
      const position = open.map((a) => a.lifeline === message.from && callers.get(a) === message.to).lastIndexOf(true);
      if (position < 0) {
        looseReplies.push(index);
      } else {
        open[position]!.to = index;
        open.splice(position, 1);
      }
    }
  });
  closeLeaving([]);
  return { activations, looseReplies };
}

function nodesById(nodes: readonly Node[], target = new Map<string, Node>()): Map<string, Node> {
  for (const node of nodes) {
    target.set(node.id, node);
    nodesById(node.children, target);
  }
  return target;
}

/** Lifeline ids of a Message list: `order` first (those that participate), then by first appearance. */
export function lifelinesOf(messages: readonly Pick<Message, 'from' | 'to'>[], order: readonly string[]): string[] {
  const appearance = [...new Set(messages.flatMap((m) => [m.from, m.to]))];
  const sorted = [...new Set(order)].filter((id) => appearance.includes(id));
  return [...sorted, ...appearance.filter((id) => !sorted.includes(id))];
}

/**
 * Projects the Interaction of `view`: the Lifelines (resolved Nodes, without children, in column order) and the Messages.
 * An end inside a Collapsed group (`collapsedAncestor`) is lifted to the Group; a Message left with both
 * ends on the same Lifeline becomes a self Message. `create`/`destroy` of a descendant neither create nor destroy the Group:
 * when lifted they become `async`. An excluded end (or its Group) removes the Message; a Fragment without Messages disappears.
 * With `autonumber` each projected Message carries its number before the label. A Node that does not exist is skipped; an
 * Interaction that does not exist yields an empty Interaction with the named id (`validate` reports them).
 */
export function resolveSequence(
  interactions: readonly Interaction[],
  nodes: readonly Node[],
  view: View,
  excluded: ReadonlySet<string>,
  resolveNode: (node: Node) => ResolvedNode,
  collapsedAncestor: ReadonlyMap<string, string> = new Map(),
  planned: PlannedSets = plannedSets({ nodes, interactions }),
): { nodes: ResolvedNode[]; interaction: ResolvedInteraction } {
  const interaction = interactions.find((candidate) => candidate.id === view.interaction);
  if (interaction === undefined) return { nodes: [], interaction: { id: view.interaction ?? '', title: '', messages: [], items: [] } };
  const byId = nodesById(nodes);
  const lift = (id: string): string => collapsedAncestor.get(id) ?? id;
  const visible = (id: string): boolean => byId.has(id) && !excluded.has(id) && !excluded.has(lift(id));
  const messages: ResolvedMessage[] = [];
  const project = (items: readonly InteractionItem[], prefix: string, scope: string[]): ResolvedItem[] =>
    items.flatMap((item, index): ResolvedItem[] => {
      const path = `${prefix}${index}`;
      if (item.type === 'fragment') {
        const inside = [...scope, path];
        const operands = item.operands.map((operand, k) => ({ ...(operand.guard !== undefined && { guard: operand.guard }), items: project(operand.items, `${path}.${k}.`, inside) }));
        return [{ type: 'fragment', path, operator: item.operator, operands }];
      }
      if (item.type === 'note') return [{ type: 'note', path, anchor: item.anchor, targets: item.targets.filter(visible), text: item.text }];
      if (item.type === 'ref') {
        const referenced = interactions.find((candidate) => candidate.id === item.interaction);
        return referenced === undefined ? [] : [{ type: 'ref', path, interaction: referenced.id, title: referenced.title, participants: [...new Set(flattenMessages(referenced.items).flatMap((m) => [m.from, m.to]).map(lift))] }];
      }
      if (!visible(item.from) || !visible(item.to)) return [];
      const from = lift(item.from);
      const to = lift(item.to);
      const kind = (item.kind === 'create' || item.kind === 'destroy') && to !== item.to ? 'async' : item.kind;
      const message: ResolvedMessage = { path, ...(item.id !== undefined && { id: item.id }), kind, from, to, ...(item.label !== undefined && { label: item.label }), ...(scope.length > 0 && { scope }), ...(plannedMessage(item, interaction.id, planned) && { planned: true }) };
      messages.push(message);
      return [{ type: 'message', message }];
    });
  const raw = project(interaction.items, '', []);
  if (view.autonumber === true) {
    messages.forEach((message, i) => {
      message.number = i + 1;
      message.label = message.label === undefined ? `${i + 1}` : `${i + 1}. ${message.label}`;
    });
  }
  const sorted = lifelinesOf(messages, view.order.map(lift));
  const { order, groups: unlabeledGroups } = groupLifelines(sorted, nodes);
  const lifelines = order.map((id) => ({ ...resolveNode(byId.get(id)!), children: [] }));
  const groups = unlabeledGroups.map((group) => ({ ...group, label: resolveNode(byId.get(group.id)!).label }));
  // Needs the final Lifelines: drops Notes without own Lifelines, `ref` without Lifelines and empty Fragments.
  const prune = (items: readonly ResolvedItem[]): ResolvedItem[] =>
    items.flatMap((item): ResolvedItem[] => {
      if (item.type === 'message') return [item];
      if (item.type === 'note') {
        const targets = item.targets.filter((id) => order.includes(id));
        return targets.length === 0 ? [] : [{ ...item, targets }];
      }
      if (item.type === 'ref') return order.length === 0 ? [] : [{ ...item, participants: order.filter((id) => item.participants.includes(id)) }];
      const operands = item.operands.map((operand) => ({ ...operand, items: prune(operand.items) }));
      return operands.every((operand) => operand.items.length === 0) ? [] : [{ ...item, operands }];
    });
  const items = prune(raw);
  return { nodes: lifelines, interaction: { id: interaction.id, title: interaction.title, messages, items, ...(groups.length > 0 && { groups }) } };
}

/**
 * The `box` of the open Groups: a Group has a `box` if some Lifeline is its descendant. Reorders the
 * Lifelines so those of each `box` are contiguous (at the place of the first appearance) with the Group's
 * own, if it has one, first. Returns the new order and the `box`es outermost first.
 */
function groupLifelines(ids: readonly string[], roots: readonly Node[]): { order: string[]; groups: Omit<GroupBox, 'label'>[] } {
  const parent = new Map<string, string>();
  const record = (children: readonly Node[], of: string | undefined): void => {
    for (const child of children) {
      if (of !== undefined) parent.set(child.id, of);
      record(child.children, child.id);
    }
  };
  record(roots, undefined);
  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    for (let current = parent.get(id); current !== undefined; current = parent.get(current)) chain.unshift(current);
    return chain;
  };
  const withBox = new Set(ids.flatMap(ancestors));
  const chain = (id: string): string[] => [...ancestors(id), ...(withBox.has(id) ? [id] : [])];
  const group = (members: readonly string[], level: number): string[] => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const id of members) {
      const key = chain(id)[level];
      if (key === undefined) {
        result.push(id);
      } else if (!seen.has(key)) {
        seen.add(key);
        const inside = members.filter((m) => chain(m)[level] === key);
        result.push(...group([...inside.filter((m) => m === key), ...inside.filter((m) => m !== key)], level + 1));
      }
    }
    return result;
  };
  const order = group(ids, 0);
  const groups = [...withBox]
    .map((id) => ({ id, level: ancestors(id).length, lifelines: order.filter((l) => chain(l).includes(id)) }))
    .sort((a, b) => a.level - b.level || order.indexOf(a.lifelines[0]!) - order.indexOf(b.lifelines[0]!));
  return { order, groups };
}

/**
 * Navigation target of a `ref`: the first declared sequence View that projects the referenced Interaction,
 * or `undefined` if none (the frame stays inert and `validate` warns).
 */
export function refTarget(views: readonly Pick<View, 'id' | 'type' | 'interaction'>[], interaction: string): string | undefined {
  return views.find((view) => view.type === 'sequence' && view.interaction === interaction)?.id;
}

/** Model Message with its location in the Interaction (`['items', 2, 'operands', 0, 'items', 1]`) and the Fragments that contain it. */
export interface LocatedMessage extends Message {
  location: (string | number)[];
  scope: string[];
}

/** Messages of an item list, in temporal order, flattening the Fragments. */
export function flattenMessages(items: readonly InteractionItem[], location: (string | number)[] = ['items'], prefix = '', scope: string[] = []): LocatedMessage[] {
  return items.flatMap((item, index): LocatedMessage[] => {
    const here = [...location, index];
    if (item.type === 'message') return [{ ...item, location: here, scope }];
    if (item.type !== 'fragment') return [];
    const path = `${prefix}${index}`;
    return item.operands.flatMap((operand, k) => flattenMessages(operand.items, [...here, 'operands', k, 'items'], `${path}.${k}.`, [...scope, path]));
  });
}
