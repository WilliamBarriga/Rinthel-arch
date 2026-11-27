/**
 * Reveal Steps (ADR 0002). Pure and without geometry: the layout is computed once with all the elements.
 * A Step does not animate; the Theme triggers `enter`/`exit` (ADR 0008).
 */
import type { StepEdge, Edge, StepElement } from './schema';
import { matchesSelector } from './views';
import type { ResolvedNode, GraphView, SequenceView, ResolvedView } from './views';
import type { ResolvedItem } from './sequence';

/**
 * Visibility by Node id, `edgeId` or `sequenceElementId`: 0 hidden, 1 revealed. `revealAt` only
 * yields 0 and 1; it is numeric so whoever animates (the shell's morph) blends with intermediate values.
 */
export type Visibility = (id: string) => number;

/**
 * Id of a Message, Note, `ref` or Fragment: `<interaction>:<path>`; with `operand`, the one for its guard and divider:
 * `<interaction>:<path>:<k>`. The only place that builds the format.
 */
export function sequenceElementId(interaction: string, path: string, operand?: number): string {
  return operand === undefined ? `${interaction}:${path}` : `${interaction}:${path}:${operand}`;
}

/** Inverse reading of `sequenceElementId`; `undefined` if `id` does not have that format (e.g. a Node id). */
export function parseSequenceElementId(id: string): { interaction: string; path: string; operand?: number } | undefined {
  const m = /^(.+?):(\d+(?:\.\d+)*)(?::(\d+))?$/.exec(id);
  if (m === null) return undefined;
  return { interaction: m[1]!, path: m[2]!, ...(m[3] !== undefined && { operand: Number(m[3]) }) };
}

/** `from -> to`, with `#attribute` if the end carries one. */
export function edgeId(edge: Pick<Edge, 'from' | 'to'>): string {
  const endpoint = ({ node, attribute }: Edge['from']): string => (attribute === undefined ? node : `${node}#${attribute}`);
  return `${endpoint(edge.from)} -> ${endpoint(edge.to)}`;
}

/**
 * The integer k applies steps 1..k (0 is before the first); a fraction counts as its integer part and out
 * of range is clamped. Without `steps` everything is 1. An Edge appears on its own with both ends visible, unless some
 * step names it: then it waits for that step. A Collapsed group is 1 if it or any of its children is revealed.
 * `a.*` and `a.**` also reveal (or with `hide`, hide) the Group `a`.
 */
export function revealAt(view: ResolvedView, position: number): Visibility {
  const { steps } = view;
  if (steps.length === 0) return () => 1;

  const clamped = Number.isNaN(position) ? 0 : Math.min(Math.max(position, 0), steps.length);
  switch (view.type) {
    case 'sequence':
      return revealSequence(view, Math.floor(clamped));
    case 'architecture':
    case 'flow':
    case 'er': {
      const revealedAfter = stateAfter(view, Math.floor(clamped));
      return (id) => (revealedAfter.has(id) ? 1 : 0);
    }
  }
}

function stateAfter(view: GraphView, k: number): Set<string> {
  const nodes = view.nodes;
  const named = new Set(
    view.steps.flatMap((step) => step.show.filter(isEdge).flatMap((item) => edgeIds(view, item))),
  );
  const revealed = new Set<string>();
  const shown = new Set<string>();
  const hidden = new Set<string>();

  for (const step of view.steps.slice(0, k)) {
    for (const item of step.show) {
      if (isEdge(item)) {
        for (const id of edgeIds(view, item)) {
          shown.add(id);
          hidden.delete(id);
        }
      } else {
        for (const node of nodes) {
          if (reaches(item.selector, node)) revealed.add(node.id);
        }
      }
    }
    for (const item of step.hide) {
      if (isEdge(item)) {
        for (const id of edgeIds(view, item)) {
          shown.delete(id);
          hidden.add(id);
        }
      } else {
        for (const node of nodes) {
          if (covers(item.selector, node.id)) revealed.delete(node.id);
        }
      }
    }
  }

  const visibleOnes = new Set(revealed);
  for (const edge of view.edges) {
    const id = edgeId(edge);
    const allowed = named.has(id) ? shown.has(id) : !hidden.has(id);
    if (allowed && revealed.has(edge.from.node) && revealed.has(edge.to.node)) visibleOnes.add(id);
  }
  return visibleOnes;
}

/** Unlike the View's `include`, `a.*` and `a.**` also cover the Group `a`. */
function covers(selector: string, id: string): boolean {
  if (matchesSelector(selector, id)) return true;
  return selector.endsWith('.*') || selector.endsWith('.**') ? id === selector.replace(/\.\*\*?$/, '') : false;
}

/** A Collapsed group is also revealed by any of its children hidden behind it. */
function reaches(selector: string, node: ResolvedNode): boolean {
  if (covers(selector, node.id)) return true;
  if (!node.collapsed) return false;
  const base = selector.replace(/\.\*\*?$/, '');
  return base === node.id || base.startsWith(`${node.id}.`);
}

function isEdge(item: StepElement): item is StepEdge {
  return 'from' in item;
}

/** Ignores the ends' Attributes; an end inside a Collapsed group matches the Group, where it was lifted. */
function edgeIds(view: GraphView, item: StepEdge): string[] {
  return view.edges
    .filter((edge) => isEndpoint(edge.from.node, item.from) && isEndpoint(edge.to.node, item.to))
    .map(edgeId);
}

function isEndpoint(inView: string, named: string): boolean {
  return inView === named || named.startsWith(`${inView}.`);
}

/**
 * Step k cuts time at the `cut` Message of its Step. At Step 0 nothing is revealed; from the first, all
 * Lifelines except those born with `create`, which appear with their Message. A Note or `ref` appears with the Message
 * that precedes it (those before the first, at the first Step); a Fragment and each operand, when the cut reaches its
 * first Message.
 */
function revealSequence(view: SequenceView, k: number): Visibility {
  const interaction = view.interaction;
  const step = view.steps[k - 1];
  if (step === undefined) return () => 0;
  const messages = interaction.messages;
  const cut = messages.findIndex((message) => message.path === step.cut);
  const revealed = new Set<string>();
  const idOf = (path: string, operand?: number): string => sequenceElementId(interaction.id, path, operand);

  const created = new Map(messages.flatMap((message, i) => (message.kind === 'create' ? [[message.to, i] as const] : [])));
  for (const node of view.nodes) {
    if ((created.get(node.id) ?? -1) <= cut) revealed.add(node.id);
  }
  messages.forEach((message, i) => {
    if (i <= cut) revealed.add(idOf(message.path));
  });

  // `previous`: index of the last Message seen in temporal order (-1 if none).
  const firstMessage = (items: readonly ResolvedItem[], from: number): number => {
    for (const item of items) {
      if (item.type === 'message') return messages.indexOf(item.message);
      if (item.type === 'fragment') {
        for (const operand of item.operands) {
          const inside = firstMessage(operand.items, -2);
          if (inside !== -2) return inside;
        }
      }
    }
    return from;
  };
  const walk = (items: readonly ResolvedItem[], previous: number): number => {
    for (const item of items) {
      if (item.type === 'message') {
        previous = messages.indexOf(item.message);
      } else if (item.type === 'note' || item.type === 'ref') {
        if (previous <= cut) revealed.add(idOf(item.path));
      } else {
        const enters = firstMessage([item], previous);
        if (enters <= cut) revealed.add(idOf(item.path));
        item.operands.forEach((operand, o) => {
          if (firstMessage(operand.items, previous) <= cut) revealed.add(idOf(item.path, o));
          previous = walk(operand.items, previous);
        });
      }
    }
    return previous;
  };
  walk(interaction.items, -1);
  return (id) => (revealed.has(id) ? 1 : 0);
}
