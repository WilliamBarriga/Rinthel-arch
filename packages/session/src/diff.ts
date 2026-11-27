/**
 * Diff (CONTEXT.md): what changed between two Canonical forms, element by element. Pure; separate from
 * `classifyChange`, which decides how to redraw. The types, the identity (`elementKey`) and the schema live in
 * `canonical` (`dev.ts`), shared by `estudio` and `cli`.
 * Invariants: it does not detect renames (a rename is a removal plus an addition); each changed element carries its
 * changed properties tagged `texto` (label, description, Message text) or `estructura` (the rest). Stable order:
 * by element kind and, within it, by declaration order.
 */
import { flattenMessages, elementKey } from 'canonical';
import type { Edge, Diff, ChangedElement, DiffElement, CanonicalForm, Node, ChangedProperty } from 'canonical';

interface Comparable {
  element: DiffElement;
  /** Property -> value; compared as JSON. */
  values: Record<string, unknown>;
}

const TEXT_PROPERTIES = new Set(['title', 'description', 'label', 'notes']);

const flattenNodes = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flattenNodes(n.children)]);

function elementsOf(source: CanonicalForm): Comparable[] {
  const nodes = flattenNodes(source.model.nodes);
  const byPair = new Map<string, number>();
  const edge = (a: Edge): Comparable => {
    const pair = `${a.from.node}->${a.to.node}`;
    const ordinal = byPair.get(pair) ?? 0;
    byPair.set(pair, ordinal + 1);
    return {
      element: { kind: 'edge', from: a.from.node, to: a.to.node, ordinal },
      values: { label: a.label, from: a.from.attribute, to: a.to.attribute, fromCardinality: a.fromCardinality, toCardinality: a.toCardinality, identifying: a.identifying },
    };
  };
  const interactions = source.model.interactions ?? [];
  return [
    ...nodes.map((n): Comparable => ({ element: { kind: 'node', id: n.id }, values: { type: n.type, title: n.title, description: n.description, source: n.source } })),
    ...nodes.flatMap((n) =>
      n.attributes.map((a): Comparable => ({ element: { kind: 'attribute', node: n.id, name: a.name }, values: { type: a.type, notes: a.notes, keys: a.keys, optional: a.optional } })),
    ),
    ...source.model.edges.map(edge),
    ...interactions.map((i): Comparable => ({ element: { kind: 'interaction', id: i.id }, values: { title: i.title, description: i.description } })),
    ...interactions.flatMap((i) =>
      flattenMessages(i.items).map((m, position): Comparable => ({
        element: { kind: 'message', interaction: i.id, ...(m.id !== undefined && { id: m.id }), position, path: m.location.filter((p) => typeof p === 'number').join('.') },
        values: { kind: m.kind, from: m.from, to: m.to, label: m.label, description: m.description },
      })),
    ),
    ...source.views.map(({ id, ...rest }): Comparable => ({ element: { kind: 'view', id }, values: rest })),
    ...source.themes.map(({ name, ...rest }): Comparable => ({ element: { kind: 'theme', name }, values: rest })),
  ];
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What changes from `before` to `after`. */
export function computeDiff(before: CanonicalForm, after: CanonicalForm): Diff {
  const earlier = new Map(elementsOf(before).map((c) => [elementKey(c.element), c]));
  const currentElements = elementsOf(after);
  const currentKeys = new Set(currentElements.map((c) => elementKey(c.element)));
  const added: DiffElement[] = [];
  const changed: ChangedElement[] = [];
  for (const current of currentElements) {
    const previous = earlier.get(elementKey(current.element));
    if (previous === undefined) {
      added.push(current.element);
      continue;
    }
    const names = [...new Set([...Object.keys(current.values), ...Object.keys(previous.values)])];
    const properties = names
      .filter((name) => !sameJson(current.values[name], previous.values[name]))
      .map((name): ChangedProperty => ({ nombre: name, clase: TEXT_PROPERTIES.has(name) ? 'texto' : 'estructura' }));
    if (properties.length > 0) changed.push({ elemento: current.element, propiedades: properties });
  }
  const removed = [...earlier.entries()].filter(([key]) => !currentKeys.has(key)).map(([, c]) => c.element);
  return { agregados: added, quitados: removed, cambiados: changed };
}
