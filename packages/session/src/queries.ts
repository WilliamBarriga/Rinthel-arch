import { INSPECT_CONTRACT_VERSION, flattenMessages, plannedEdge, nearestCandidates, lifelinesOf, parentOf, plannedSets, resolveView } from 'canonical';
import type { Edge, CanonicalForm, Node, SourcePath, InspectOutput, Locator } from 'canonical';

type Site = { file: string; line: number };

import type { ThemeQueryOptions } from './theme-query';

/** `argument` is text for `search`, a name for `theme` and an id for the rest; the `theme` options tune its cascade. */
export type Query = { command: 'search' | 'node' | 'view' | 'interaction'; argument: string } | { command: 'planned'; argument?: string } | ({ command: 'theme'; argument: string } & ThemeQueryOptions);

/** `notFound` is the message (with `Did you mean: ...`); `suggestions`, the similar ids it names. */
export type QueryAnswer = { output: InspectOutput } | { notFound: string; suggestions: string[] };

/** In document order. */
function walkNodes(nodes: readonly Node[], path: SourcePath = ['model', 'nodes']): { node: Node; path: SourcePath }[] {
  return nodes.flatMap((node, i) => {
    const ownPath = [...path, i];
    return [{ node, path: ownPath }, ...walkNodes(node.children, [...ownPath, 'children'])];
  });
}

export function runQuery(source: CanonicalForm, locate: Locator, { command, argument = '' }: Exclude<Query, { command: 'theme' }>): QueryAnswer {
  const siteOf = (path: SourcePath): Site => {
    const site = locate(path);
    return { file: site?.file ?? '(unknown)', line: site?.range.start.line ?? 1 };
  };
  const nodes = walkNodes(source.model.nodes).map(({ node, path }) => ({ node, path, site: siteOf([...path, 'name']) }));
  const views = source.views.map((view, i) => ({ view, site: siteOf(['views', i, 'id']) }));
  const interactions = source.model.interactions.map((interaction, i) => ({ interaction, site: siteOf(['model', 'interactions', i, 'id']) }));
  const summary = ({ node, site }: (typeof nodes)[number]) => ({ id: node.id, type: node.type, title: node.title, ...site });
  const edgeSummary = (edge: Edge, i: number, fixedSite?: Site) => ({
    from: edge.from.node,
    to: edge.to.node,
    ...(edge.from.attribute === undefined ? {} : { fromAttribute: edge.from.attribute }),
    ...(edge.to.attribute === undefined ? {} : { toAttribute: edge.to.attribute }),
    ...(edge.label === undefined ? {} : { label: edge.label }),
    ...(fixedSite ?? siteOf(['model', 'edges', i, 'from', 'node'])),
  });

  if (command === 'search') {
    const needle = argument.toLowerCase();
    const matches = (text: string | undefined): boolean => text !== undefined && text.toLowerCase().includes(needle);
    // Order: exact id, id (or its last segment) starting with the query, other id or title matches, and last the
    // matches only in the description (assumptions and open questions live there); within each, declaration order.
    const rank = (r: { id: string; descriptionOnly: boolean }) =>
      r.descriptionOnly ? 3 : r.id.toLowerCase() === needle ? 0 : r.id.toLowerCase().startsWith(needle) || r.id.slice(r.id.lastIndexOf('.') + 1).toLowerCase().startsWith(needle) ? 1 : 2;
    const hits = [
      ...nodes
        .filter(({ node }) => matches(node.id) || matches(node.title) || matches(node.description))
        .map((n) => ({ r: { kind: 'node' as const, ...summary(n) }, descriptionOnly: !matches(n.node.id) && !matches(n.node.title) })),
      ...views
        .filter(({ view }) => matches(view.id))
        .map(({ view, site }) => ({ r: { kind: 'view' as const, id: view.id, type: view.type, title: view.id, ...site }, descriptionOnly: false })),
      ...interactions
        .filter(({ interaction }) => matches(interaction.id) || matches(interaction.title) || matches(interaction.description))
        .map(({ interaction, site }) => ({
          r: { kind: 'interaction' as const, id: interaction.id, type: 'interaction', title: interaction.title, ...site },
          descriptionOnly: !matches(interaction.id) && !matches(interaction.title),
        })),
    ];
    const results = hits
      .map((e, order) => ({ ...e, order }))
      .sort((a, b) => rank({ id: a.r.id, descriptionOnly: a.descriptionOnly }) - rank({ id: b.r.id, descriptionOnly: b.descriptionOnly }) || a.order - b.order)
      .map(({ r }) => r);
    return { output: { contractVersion: INSPECT_CONTRACT_VERSION, command, query: argument, results } };
  }

  if (command === 'planned') {
    const p = plannedSets(source.model);
    return {
      output: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        command,
        planned: {
          nodes: nodes
            .filter(({ node }) => p.nodes.has(node.id))
            .map((n) => ({ ...summary(n), spec: n.node.source.filter((s) => s.kind === 'spec').map((s) => s.ref), inherited: n.node.planned !== true })),
          attributes: nodes.flatMap(({ node, path }) =>
            node.attributes.flatMap((attribute, i) =>
              attribute.planned === true ? [{ node: node.id, name: attribute.name, type: attribute.type, ...siteOf([...path, 'attributes', i, 'planned']) }] : [],
            ),
          ),
          edges: source.model.edges.flatMap((edge, i) => (plannedEdge(edge, p) ? [{ ...edgeSummary(edge, i), inherited: edge.planned !== true }] : [])),
          interactions: interactions.filter(({ interaction }) => interaction.planned === true).map(({ interaction, site }) => ({ id: interaction.id, title: interaction.title, ...site })),
        },
      },
    };
  }

  if (command === 'interaction') {
    const found = interactions.find(({ interaction }) => interaction.id === argument);
    if (found === undefined) {
      const nearest = nearestCandidates(argument, interactions.map(({ interaction }) => interaction.id));
      return { notFound: `No such Interaction '${argument}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`, suggestions: nearest };
    }
    const { interaction, site } = found;
    const messages = flattenMessages(interaction.items);
    return {
      output: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        command,
        interaction: {
          id: interaction.id,
          title: interaction.title,
          description: interaction.description,
          ...site,
          items: interaction.items.length,
          messages: messages.length,
          lifelines: lifelinesOf(messages, []),
          views: views.filter(({ view }) => view.type === 'sequence' && view.interaction === interaction.id).map(({ view, site: s }) => ({ id: view.id, ...s })),
        },
      },
    };
  }

  if (command === 'node') {
    const found = nodes.find(({ node }) => node.id === argument);
    if (found === undefined) {
      const nearest = nearestCandidates(argument, nodes.map(({ node }) => node.id));
      return { notFound: `No such Node '${argument}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`, suggestions: nearest };
    }
    const { node } = found;
    const parent = parentOf(node.id);
    const edges = source.model.edges.flatMap((edge, i) => {
      const outgoing = edge.from.node === node.id;
      const incoming = edge.to.node === node.id;
      return outgoing || incoming ? [{ ...edgeSummary(edge, i), direction: outgoing ? ('out' as const) : ('in' as const) }] : [];
    });
    const inViews = views.filter(({ view }) => {
      const resolved = resolveView(source, view.id);
      const visible = (children: readonly { id: string; children: readonly unknown[] }[]): boolean =>
        children.some((n) => n.id === node.id || visible(n.children as typeof children));
      return resolved !== undefined && visible(resolved.nodes);
    });
    return {
      output: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        command,
        node: {
          ...summary(found),
          description: node.description,
          ...(parent === '' ? {} : { parent }),
          children: node.children.map(({ id }) => id),
          attributes: node.attributes.map(({ name, type, notes }) => ({ name, type, notes })),
        },
        edges,
        views: inViews.map(({ view, site }) => ({ id: view.id, ...site })),
      },
    };
  }

  const found = views.find(({ view }) => view.id === argument);
  const resolved = found === undefined ? undefined : resolveView(source, argument);
  if (found === undefined || resolved === undefined) {
    const nearest = nearestCandidates(argument, views.map(({ view }) => view.id));
    return { notFound: `No such View '${argument}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`, suggestions: nearest };
  }
  const visibleIds = new Set<string>();
  const mark = (children: typeof resolved.nodes): void => children.forEach((n) => (visibleIds.add(n.id), mark(n.children)));
  mark(resolved.nodes);
  // An Edge lifted by a Collapsed group is located at the first Model Edge it merges.
  const isWithin = (id: string, group: string): boolean => id === group || id.startsWith(`${group}.`);
  const edgeIndex = (a: Edge): number => {
    const exact = source.model.edges.findIndex((e) => e.from.node === a.from.node && e.to.node === a.to.node && e.label === a.label);
    return exact >= 0 ? exact : source.model.edges.findIndex((e) => isWithin(e.from.node, a.from.node) && isWithin(e.to.node, a.to.node));
  };
  return {
    output: {
      contractVersion: INSPECT_CONTRACT_VERSION,
      command,
      view: {
        id: found.view.id,
        type: found.view.type,
        ...(found.view.interaction === undefined ? {} : { interaction: found.view.interaction }),
        ...found.site,
        nodes: nodes.filter(({ node }) => visibleIds.has(node.id)).map(summary),
        edges: (resolved.type === 'sequence' ? [] : resolved.edges).map((edge) => {
          const i = edgeIndex(edge);
          // Without a Model Edge behind it, the site is the View's.
          return i < 0 ? { ...edgeSummary(edge, 0, found.site), count: edge.count } : { ...edgeSummary(edge, i), count: edge.count };
        }),
      },
    },
  };
}

