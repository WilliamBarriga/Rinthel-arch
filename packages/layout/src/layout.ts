/** Layout of a graph View with ELK: `INCLUDE_CHILDREN`, without `considerModelOrder`. */
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import { edgeId } from 'canonical';
import type { NodeBox, Geometry, GraphGeometry, ResolvedItem, ResolvedNode, NodeOverride, Point, EdgeRoute, Theme, GraphView, ResolvedView } from 'canonical';

import { geometryIndex } from './geometry-index';
import { layoutSequence } from './sequence';
import { ER_MARKER_LENGTH, visibleAttributes, metricsKey, placeInBox, placeNode, nodeContent, asTable, leafMetrics, metricsTable, labelSize } from 'theme';
import type { TextMeasures, Metrics, MetricsTable } from 'theme';


export interface LayoutOptions {
  /** Defaults to the bundled one, which runs the same in Node and in a Web Worker. */
  elk?: ELK;
  /** Defaults to the table derived from the Theme; a single `Metrics` applies to every element. `render` must draw with the same ones. */
  metricas?: Metrics | MetricsTable;
  /** Without them text is estimated per character. Ignored when `metrics` is passed. */
  measures?: TextMeasures;
}

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.edgeCoords': 'ROOT',
  'elk.json.shapeCoords': 'PARENT',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  // 1 (the minimum) halves the relayout of 1k Nodes.
  'elk.layered.thoroughness': '1',
};

/**
 * Deterministic. Closed Groups are leaf Nodes. Without `options.elk` it creates one engine per call.
 * Rejects if ELK fails.
 */
export async function layoutView(
  view: ResolvedView,
  theme: Theme,
  options: LayoutOptions = {},
): Promise<Geometry> {
  return layoutWithMetrics(view, options.metricas ?? metricsTable(theme, view.type, options.measures), options);
}

/** `layoutView` over already resolved Metrics, without the Theme: it is what the Worker runs, which does not bundle the Theme schema. */
export async function layoutWithMetrics(
  view: ResolvedView,
  metricas: Metrics | MetricsTable,
  options: { elk?: ELK } = {},
): Promise<Geometry> {
  switch (view.type) {
    case 'architecture':
    case 'flow':
    case 'er':
      return layoutGraph(view, metricas, options);
    case 'sequence':
      return layoutSequence(view, metricas);
  }
}

async function layoutGraph(
  view: GraphView,
  metricas: Metrics | MetricsTable,
  options: { elk?: ELK },
): Promise<GraphGeometry> {
  // Dynamic import: whoever only uses the measures (render) does not pull ELK into its bundle.
  const elk = options.elk ?? new (await import('elkjs/lib/elk.bundled.js')).default();
  const measures = asTable(metricas);

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: ROOT_OPTIONS,
    children: geometryIndex(view, { nodes: {} }).roots.map((node) => toElk(node, measures)),
    edges: view.edges.map((edge) => ({
      id: edgeId(edge),
      sources: [edge.from.node],
      targets: [edge.to.node],
      ...(edge.label !== undefined && { labels: [{ id: `${edgeId(edge)}:label`, text: edge.label, ...labelSize(edge.label, measures.etiqueta) }] }),
    })),
  };
  const result = await elk.layout(graph);

  const nodes: Record<string, NodeBox> = {};
  const collect = (childNodes: readonly ElkNode[] | undefined): void => {
    for (const child of childNodes ?? []) {
      nodes[child.id] = { x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0 };
      collect(child.children);
    }
  };
  collect(result.children);
  const edges: Record<string, EdgeRoute> = {};
  const labels: Record<string, NodeBox> = {};
  for (const edge of result.edges ?? []) {
    const [section] = edge.sections ?? [];
    if (section === undefined) continue;
    const [label] = edge.labels ?? [];
    if (label !== undefined) labels[edge.id] = { x: label.x ?? 0, y: label.y ?? 0, width: label.width ?? 0, height: label.height ?? 0 };
    edges[edge.id] = { points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => ({ x, y })) };
  }
  return withPinsAndPorts(view, measures, { kind: 'grafo', nodes, edges, labels, pinsSolapados: [], width: result.width ?? 0, height: result.height ?? 0 });
}

function withPinsAndPorts(view: GraphView, measures: MetricsTable, base: GraphGeometry): GraphGeometry {
  const pinned = applyPins(view, base.nodes, base.edges, base.labels);
  const withPorts = { ...pinned, edges: snapToAttributePorts(view, measures, pinned.nodes, pinned.edges) };
  // ER: the crow's foot needs a horizontal final segment at least as long as itself; it is ensured after ports and Pins.
  if (view.type === 'er') withPorts.edges = ensureErFinalSegments(view, geometryIndex(view, { nodes: withPorts.nodes }).boxes, withPorts.edges);
  return { ...withPorts, kind: 'grafo', nodes: withSlots(view, measures, withPorts.nodes), width: base.width, height: base.height };
}

/** Adds to each leaf Node the rectangle of its Slots, the same one `render` uses to paint. */
function withSlots(view: ResolvedView, measures: MetricsTable, nodes: Record<string, NodeBox>): Record<string, NodeBox> {
  const result = { ...nodes };
  for (const node of view.nodes) {
    const box = result[node.id];
    if (node.children.length === 0 && box !== undefined) {
      const m = leafMetrics(measures, node);
      result[node.id] = { ...box, slots: placeInBox(m, nodeContent(node, m), box.width).slots };
    }
  }
  return result;
}

/**
 * Applies the Pins of `view` to `base`, the geometry of the same structure computed without Pins. Gives the same
 * result as `layoutView` without running ELK again.
 */
export function applyPinsToGeometry(view: ResolvedView, base: Geometry, theme: Theme, metricas: Metrics | MetricsTable = metricsTable(theme, view.type)): Geometry {
  switch (view.type) {
    case 'sequence':
      // The sequence Geometry comes complete from its layout: there is no post-layout step.
      return base;
    case 'architecture':
    case 'flow':
    case 'er':
      return base.kind === 'grafo' ? withPinsAndPorts(view, asTable(metricas), base) : base;
  }
}

/**
 * The center of the pinned Node's box moves to `pin`, relative to its parent Group. An Edge with both ends
 * in the moved subtree moves with its label; one that crosses it is rerouted in Z and loses its label
 * (`render` puts it on the new route). A Pin on a missing Node is ignored. Does not mutate its arguments.
 * `pinsSolapados`: pairs of pinned Nodes whose boxes overlap, except ancestor and descendant.
 */
function applyPins(
  view: GraphView,
  nodes: Record<string, NodeBox>,
  edges: Record<string, EdgeRoute>,
  labels: Record<string, NodeBox>,
): Pick<GraphGeometry, 'nodes' | 'edges' | 'labels' | 'pinsSolapados'> {
  const pins = pinsOf(view).filter((o) => nodes[o.node] !== undefined);
  if (pins.length === 0) return { nodes, edges, labels, pinsSolapados: [] };
  const pinnedBoxes: Record<string, NodeBox> = { ...nodes };
  for (const { node, pin } of pins) {
    const box = pinnedBoxes[node]!;
    pinnedBoxes[node] = { ...box, x: pin.x - box.width / 2, y: pin.y - box.height / 2 };
  }
  const previous = geometryIndex(view, { nodes });
  const index = geometryIndex(view, { nodes: pinnedBoxes });
  const { parent } = index;
  const isInside = (id: string, root: string): boolean => id === root || (parent.has(id) && isInside(parent.get(id)!, root));
  const moved = pins.map((o) => o.node);
  const routes: Record<string, EdgeRoute> = { ...edges };
  const labelBoxes: Record<string, NodeBox> = { ...labels };
  for (const edge of view.edges) {
    const [source, target] = [edge.from.node, edge.to.node];
    const sourceRoot = moved.find((m) => isInside(source, m));
    const targetRoot = moved.find((m) => isInside(target, m));
    if (sourceRoot === undefined && targetRoot === undefined) continue;
    const id = edgeId(edge);
    const previousRoute = edges[id];
    if (sourceRoot === targetRoot && previousRoute !== undefined) {
      const before = previous.boxes.get(sourceRoot!)!;
      const after = index.boxes.get(sourceRoot!)!;
      const [dx, dy] = [after.x - before.x, after.y - before.y];
      routes[id] = { points: previousRoute.points.map(({ x, y }) => ({ x: x + dx, y: y + dy })) };
      const label = labelBoxes[id];
      if (label !== undefined) labelBoxes[id] = { ...label, x: label.x + dx, y: label.y + dy };
    } else {
      delete labelBoxes[id];
      routes[id] = { points: orthogonalRoute(index.boxes.get(source)!, index.boxes.get(target)!) };
    }
  }

  const pinsSolapados: [string, string][] = [];
  const ids = [...new Set(moved)].sort();
  ids.forEach((a, i) => {
    for (const b of ids.slice(i + 1)) {
      if (isInside(a, b) || isInside(b, a)) continue;
      if (overlap(index.boxes.get(a)!, index.boxes.get(b)!)) pinsSolapados.push([a, b]);
    }
  });
  return { nodes: pinnedBoxes, edges: routes, labels: labelBoxes, pinsSolapados };
}

/**
 * An Edge to `node#attribute` ends at the row of that Attribute (ELK points at the Node's center). Only a
 * horizontal final segment is adjusted; if the route has no previous elbow, one is inserted halfway.
 */
function snapToAttributePorts(
  view: GraphView,
  table: MetricsTable,
  nodes: Record<string, NodeBox>,
  edges: Record<string, EdgeRoute>,
): Record<string, EdgeRoute> {
  const attributeList = new Map(view.nodes.map((node) => [node.id, visibleAttributes(node, leafMetrics(table, node))]));
  const { boxes } = geometryIndex(view, { nodes });
  const routes = { ...edges };
  for (const edge of view.edges) {
    const id = edgeId(edge);
    const route = routes[id];
    if (route === undefined) continue;
    let points = route.points;
    for (const [side, end] of [['start', edge.from], ['end', edge.to]] as const) {
      const index = end.attribute === undefined ? -1 : (attributeList.get(end.node) ?? []).findIndex((a) => a.name === end.attribute);
      if (index < 0) continue;
      const owner = view.nodes.find((n) => n.id === end.node)!;
      const m = leafMetrics(table, owner);
      const row = placeInBox(m, nodeContent(owner, m), boxes.get(end.node)!.width).filas[index]!;
      const y = boxes.get(end.node)!.y + row.y + row.height / 2;
      points = movePort(points, side, y);
    }
    routes[id] = { points };
  }
  return routes;
}

/**
 * Each end of an ER Edge finishes in a horizontal segment at least `ER_MARKER_LENGTH` long, so the
 * cardinality marker does not sit on the elbow. A vertical end moves to the side of the Node closest to the route.
 */
function ensureErFinalSegments(view: GraphView, boxes: ReadonlyMap<string, NodeBox>, edges: Record<string, EdgeRoute>): Record<string, EdgeRoute> {
  const routes = { ...edges };
  for (const edge of view.edges) {
    const id = edgeId(edge);
    const route = routes[id];
    const [source, target] = [boxes.get(edge.from.node), boxes.get(edge.to.node)];
    if (route === undefined || route.points.length < 2 || source === undefined || target === undefined) continue;
    let points = route.points;
    // A two-point route is split first: both ends ask for their segment and share the way.
    if (points.length === 2) {
      const [a, b] = [points[0]!, points[1]!];
      const middle = (a.x + b.x) / 2;
      points = [a, { x: middle, y: a.y }, { x: middle, y: b.y }, b];
    }
    points = finalSegment(points, source, 'start');
    points = finalSegment(points, target, 'end');
    routes[id] = { points };
  }
  return routes;
}

function finalSegment(points: Point[], box: NodeBox, side: 'start' | 'end'): Point[] {
  const p = side === 'start' ? [...points] : [...points].reverse();
  // `p[0]` is the port, `p[1]` the previous elbow.
  let [port, elbow] = [p[0]!, p[1]!];
  if (port.y !== elbow.y) {
    // It arrives vertically: the port moves to the side border of the Node on the route's side, at the elbow's height (clamped to the Node).
    const rightmost = elbow.x >= box.x + box.width / 2;
    const y = Math.min(Math.max(port.y, box.y + 1), box.y + box.height - 1);
    port = { x: rightmost ? box.x + box.width : box.x, y };
    p.splice(0, 2, port, { x: elbow.x, y }, elbow);
    elbow = p[1]!;
  }
  const direction = Math.sign(elbow.x - port.x) || (port.x <= box.x + box.width / 2 ? -1 : 1);
  if (Math.abs(elbow.x - port.x) < ER_MARKER_LENGTH || Math.sign(elbow.x - port.x) !== direction) {
    const x = port.x + direction * ER_MARKER_LENGTH;
    const next = p[2];
    // If the segment leaving the elbow is vertical it moves with it; otherwise a vertical one is added.
    if (next !== undefined && next.x === elbow.x) {
      p[1] = { x, y: elbow.y };
      p[2] = { x, y: next.y };
    } else if (next === undefined) {
      p[1] = { x, y: elbow.y };
    } else {
      p.splice(1, 1, { x, y: elbow.y }, { x, y: next.y });
    }
  }
  return side === 'start' ? p : p.reverse();
}

function movePort(points: Point[], side: 'start' | 'end', y: number): Point[] {
  const copy = side === 'start' ? [...points].reverse() : [...points];
  const end = copy[copy.length - 1]!;
  const previous = copy[copy.length - 2]!;
  if (previous.y !== end.y || end.y === y) return points;
  const before = copy[copy.length - 3];
  if (before === undefined) {
    const middle = (previous.x + end.x) / 2;
    copy.splice(1, 0, { x: middle, y: previous.y }, { x: middle, y });
  } else if (before.y === previous.y) {
    // Previous segment also horizontal: a new elbow avoids leaving it diagonal.
    copy.splice(copy.length - 1, 0, { x: previous.x, y });
  } else {
    copy[copy.length - 2] = { x: previous.x, y };
  }
  copy[copy.length - 1] = { x: end.x, y };
  return side === 'start' ? copy.reverse() : copy;
}

function overlap(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Z route between the borders of two boxes: horizontal if they are apart in x or overlapping, otherwise vertical. */
function orthogonalRoute(source: NodeBox, target: NodeBox): Point[] {
  const center = (c: NodeBox): Point => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const [o, d] = [center(source), center(target)];
  if (overlap(source, target) || source.x + source.width <= target.x || target.x + target.width <= source.x) {
    const rightmost = d.x >= o.x;
    const exit = rightmost ? source.x + source.width : source.x;
    const entry = rightmost ? target.x : target.x + target.width;
    const middle = (exit + entry) / 2;
    return [{ x: exit, y: o.y }, { x: middle, y: o.y }, { x: middle, y: d.y }, { x: entry, y: d.y }];
  }
  const bottom = d.y >= o.y;
  const exit = bottom ? source.y + source.height : source.y;
  const entry = bottom ? target.y : target.y + target.height;
  const middle = (exit + entry) / 2;
  return [{ x: o.x, y: exit }, { x: o.x, y: middle }, { x: d.x, y: middle }, { x: d.x, y: entry }];
}

function elkPadding({ top, left, bottom, right }: Metrics['paddingGrupo']): string {
  return `[top=${top},left=${left},bottom=${bottom},right=${right}]`;
}

function toElk(node: ResolvedNode, table: MetricsTable): ElkNode {
  if (node.children.length === 0) {
    const measures = leafMetrics(table, node);
    const { width, height } = placeNode(nodeContent(node, measures), measures);
    return { id: node.id, width, height };
  }
  // An open Group is never narrower than its header (title, icon and collapse control).
  const { width } = placeNode(nodeContent(node, table.grupoAbierto), table.grupoAbierto);
  return {
    id: node.id,
    layoutOptions: { 'elk.padding': elkPadding(table.grupoAbierto.paddingGrupo), 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${width}, 0)` },
    children: node.children.map((child) => toElk(child, table)),
  };
}

/**
 * Geometry cache key: equal if and only if the layout does not change. It includes the visible structure, texts, Pins,
 * Metrics and whether the Node has an icon; not the palette nor colors.
 */
export function layoutKey(view: ResolvedView, theme: Theme, metricas: Metrics | MetricsTable = metricsTable(theme, view.type)): string {
  return JSON.stringify({ tipo: view.type, estructura: structureKey(view, theme, metricas), pins: pinsOf(view).map((o) => [o.node, o.pin.x, o.pin.y]) });
}

/** Overrides of the View with a Pin; a sequence View has no Pins (its order comes from `order`). */
function pinsOf(view: ResolvedView): (NodeOverride & { pin: NonNullable<NodeOverride['pin']> })[] {
  switch (view.type) {
    case 'sequence':
      return [];
    case 'architecture':
    case 'flow':
    case 'er':
      return view.overrides.flatMap((o) => (o.pin === undefined ? [] : [{ ...o, pin: o.pin }]));
  }
}

/** `layoutKey` without the Pins: identifies the geometry ELK computes. */
export function structureKey(view: ResolvedView, theme: Theme, metricas: Metrics | MetricsTable = metricsTable(theme, view.type)): string {
  const table = asTable(metricas);
  return JSON.stringify({
    tipo: view.type,
    nodos: view.nodes.map((node) => [node.id, Object.hasOwn(table.tipos, node.type) ? node.type : '', node.label, node.collapsed, node.icon !== undefined, node.children.map((child) => child.id), visibleAttributes(node, leafMetrics(table, node)).map((a) => (view.type === 'er' ? [a.name, a.type, a.keys, a.optional, a.planned] : [a.name, a.type]))]),
    ...connectionsKey(view),
    metricas: metricsKey(table),
  });
}

/** What links the Nodes in the structure key: Edges in a graph; Messages, Fragments and `box` in sequence. */
function connectionsKey(view: ResolvedView): Record<string, unknown> {
  switch (view.type) {
    case 'sequence': {
      const { messages, items, groups } = view.interaction;
      return {
        aristas: [],
        mensajes: messages.map((m) => [m.path, m.kind, m.from, m.to, m.label]),
        fragmentos: fragmentsKey(items),
        grupos: groups?.map((g) => [g.id, g.label, g.level, g.lifelines]),
      };
    }
    case 'architecture':
    case 'flow':
    case 'er':
      return { aristas: view.edges.map((edge) => [edgeId(edge), edge.label]) };
  }
}

/** Structure of the Fragments (operator, guards and which Messages they cover) for the layout key. */
function fragmentsKey(items: readonly ResolvedItem[]): unknown[] {
  return items.flatMap((item): unknown[] => {
    if (item.type === 'message') return [];
    if (item.type === 'note') return [[item.path, 'note', item.anchor, item.targets, item.text]];
    if (item.type === 'ref') return [[item.path, 'ref', item.title, item.participants]];
    return [[item.path, item.operator, item.operands.map((o) => [o.guard, o.items.map((i) => (i.type === 'message' ? i.message.path : fragmentsKey([i])))])]];
  });
}
