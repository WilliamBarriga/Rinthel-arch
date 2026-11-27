/**
 * Effective Planned mark (ADR 0011): the written mark plus the inherited one. A planned Group marks its descendants
 * (and their Attributes); an Edge is planned if it carries the mark or one of its ends (Node or Attribute) is planned;
 * a Message, if its Interaction or one of its Lifelines is. Pure.
 */
import type { Edge, Endpoint, Interaction, Message, Node } from './schema';

/** What is planned in a Model, with inheritance already applied. */
export interface PlannedSets {
  /** Ids of planned Nodes (marked or under a marked Group). */
  nodes: ReadonlySet<string>;
  /** Planned `node#attribute` keys: the marked ones and all those of a planned Node. */
  attributes: ReadonlySet<string>;
  /** Ids of marked Interactions. */
  interactions: ReadonlySet<string>;
}

/** Walks the Model once; the queries (`plannedEndpoint`, `plannedEdge`, `plannedMessage`) are O(1). */
export function plannedSets(model: { nodes: readonly Node[]; interactions?: readonly Pick<Interaction, 'id' | 'planned'>[] }): PlannedSets {
  const nodes = new Set<string>();
  const attributes = new Set<string>();
  const walk = (list: readonly Node[], inherited: boolean): void => {
    for (const node of list) {
      const planned = inherited || node.planned === true;
      if (planned) nodes.add(node.id);
      for (const attribute of node.attributes) if (planned || attribute.planned === true) attributes.add(`${node.id}#${attribute.name}`);
      walk(node.children, planned);
    }
  };
  walk(model.nodes, false);
  const interactions = new Set((model.interactions ?? []).filter((i) => i.planned === true).map((i) => i.id));
  return { nodes, attributes, interactions };
}

/** Whether an Edge end (Node or `node#attribute`) is planned. */
export function plannedEndpoint(endpoint: Endpoint, p: PlannedSets): boolean {
  return p.nodes.has(endpoint.node) || (endpoint.attribute !== undefined && p.attributes.has(`${endpoint.node}#${endpoint.attribute}`));
}

/** Whether the Model Edge is drawn planned: marked or with a planned end. */
export function plannedEdge(edge: Pick<Edge, 'from' | 'to' | 'planned'>, p: PlannedSets): boolean {
  return edge.planned === true || plannedEndpoint(edge.from, p) || plannedEndpoint(edge.to, p);
}

/** Whether the Message (with its Model ends, before lifting) of Interaction `interaction` is drawn planned. */
export function plannedMessage(message: Pick<Message, 'from' | 'to'>, interaction: string, p: PlannedSets): boolean {
  return p.interactions.has(interaction) || p.nodes.has(message.from) || p.nodes.has(message.to);
}
