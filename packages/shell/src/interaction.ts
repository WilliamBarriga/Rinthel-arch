/**
 * Interaction core, pure and without DOM; points and boxes in canvas coordinates. The hit-test walks the whole
 * View (what culling does not draw can still be found), top to bottom as `render` draws: Edge label,
 * Edge (with `tolerance`), Attribute, Node (the most nested wins).
 */
import { refTarget, edgeId, sequenceElementId, parseSequenceElementId } from 'canonical';
import type { NodeBox, Geometry, ResolvedItem, ResolvedNode, Point, Theme, Visibility, View, SequenceView, ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';
import { visibleAttributes, placeInBox, nodeContent, leafMetrics } from 'theme';
import { boxlessLabelCenter, resolveStyle } from 'render';
import type { Style } from 'render';

import { contains } from './box';
import { DEFAULT_SETTINGS } from './configuration';

export type ElementKind = 'nodo' | 'arista' | 'etiqueta' | 'atributo' | 'mensaje' | 'fragmento' | 'nota';

/** Selectable element: `id` is the Node's, the `edgeId` (Edge and label), `node#attribute` or, in sequence, `interaction:path` (Message, Fragment, Note). */
export interface SelectableElement {
  kind: ElementKind;
  id: string;
}

export interface HitTestOptions {
  /** Maximum distance to an Edge stroke, in geometry units. Defaults to `DEFAULT_SETTINGS.hitTolerance`. */
  tolerance?: number;
  /** Whether Attributes are drawn (semantic zoom); without them the point falls on the Node. Defaults to true. */
  attributes?: boolean;
  /** Step visibility: in sequence, what is 0 (not revealed) is not hit. */
  visibility?: Visibility;
}

/** What the hit-test reads from the Geometry; a sequence one has no `edges` nor `labels`. */
type Geo = Pick<Geometry, 'nodes'> & {
  edges?: Record<string, { points: Point[] }>;
  labels?: Record<string, NodeBox>;
  lifelines?: Record<string, { x: number; y1: number; y2: number }>;
  activations?: readonly { lifeline: string; x: number; y1: number; y2: number; width: number }[];
  messages?: Record<string, { points: Point[]; label?: NodeBox }>;
  notes?: readonly (NodeBox & { ruta: string })[];
  fragments?: readonly (NodeBox & { ruta: string; nivel: number; tab: NodeBox })[];
};

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Label box: the one the layout reserved or, if the Edge was re-routed, one estimated on the longest segment. */
function labelBox(text: string, points: readonly Point[], reserved: NodeBox | undefined, style: Style): NodeBox {
  if (reserved !== undefined) return reserved;
  const { metrics } = style;
  const fontSizeValue = metrics.fontSize * metrics.escalaEtiqueta;
  const [width, height] = [text.length * fontSizeValue * metrics.factorDeAncho + metrics.holguraDeEtiqueta, fontSizeValue];
  const middle = boxlessLabelCenter(style, points);
  return { x: middle.x - width / 2, y: middle.y - height * (1 - style.label.verticalCentering), width, height };
}

/** Nodes in the order `render` draws them: each Group before its children. */
function inDrawOrder(roots: readonly ResolvedNode[]): ResolvedNode[] {
  return roots.flatMap((node) => [node, ...inDrawOrder(node.children)]);
}

/** The topmost element under `point`, or `undefined` if there is none. */
export function elementAt(
  view: ResolvedView,
  geometry: Geo,
  theme: Theme,
  point: Point,
  { tolerance: tolerance = DEFAULT_SETTINGS.hitTolerance, attributes: attributes = true, visibility }: HitTestOptions = {},
): SelectableElement | undefined {
  if (view.type === 'sequence') return sequenceElementAt(view, geometry, point, tolerance, visibility ?? (() => 1));
  const { boxes, roots } = geometryIndex(view, geometry);
  const style = resolveStyle(theme, view.type);

  // Edges are drawn above the Nodes; the last one drawn is the topmost.
  const edges = view.edges.map((edge) => ({ edge, id: edgeId(edge), points: geometry.edges?.[edgeId(edge)]?.points ?? [] }));
  const drawnOnes = edges.filter(({ points }) => points.length >= 2);
  for (const { edge, id, points } of [...drawnOnes].reverse()) {
    if (edge.label !== undefined && contains(labelBox(edge.label, points, geometry.labels?.[id], style), point)) return { kind: 'etiqueta', id };
  }
  for (const { id, points } of [...drawnOnes].reverse()) {
    for (let i = 1; i < points.length; i++) {
      if (distanceToSegment(point, points[i - 1]!, points[i]!) <= tolerance) return { kind: 'arista', id };
    }
  }

  for (const node of inDrawOrder(roots).reverse()) {
    const box = boxes.get(node.id);
    if (box === undefined || !contains(box, point)) continue;
    const ofNodeBlock = leafMetrics(style.table, node);
    const rows = attributes ? visibleAttributes(node, ofNodeBlock) : [];
    const straight = placeInBox(ofNodeBlock, nodeContent(node, ofNodeBlock), box.width).filas;
    const index = straight.findIndex((r) => point.y >= box.y + r.y && point.y < box.y + r.y + r.height);
    const attribute = rows[index];
    return attribute === undefined ? { kind: 'nodo', id: node.id } : { kind: 'atributo', id: `${node.id}#${attribute.name}` };
  }
  return undefined;
}

/**
 * Sequence hit, top to bottom: Message (arrow or label), Note, Lifeline (header, line or
 * activation), Fragment (only tab and border: the inside lets the click through) and background. What the Steps did not
 * reveal (`visibility` 0) is not hit.
 */
function sequenceElementAt(view: SequenceView, geometry: Geo, point: Point, tolerance: number, visibility: Visibility): SelectableElement | undefined {
  const interaction = view.interaction.id;
  const visible = (id: string): boolean => visibility(id) > 0;
  const idOf = (path: string): string => sequenceElementId(interaction, path);

  const messages = Object.entries(geometry.messages ?? {}).filter(([path]) => visible(idOf(path)));
  for (const [path, { points, label }] of messages.reverse()) {
    const overArrow = points.some((p, i) => i > 0 && distanceToSegment(point, points[i - 1]!, p) <= tolerance);
    if (overArrow || (label !== undefined && contains(label, point))) return { kind: 'mensaje', id: idOf(path) };
  }

  const note = [...(geometry.notes ?? [])].reverse().find((n) => visible(idOf(n.ruta)) && contains(n, point));
  if (note !== undefined) return { kind: 'nota', id: idOf(note.ruta) };

  const { boxes } = geometryIndex(view, geometry);
  for (const node of view.nodes) {
    const box = boxes.get(node.id);
    if (visible(node.id) && box !== undefined && contains(box, point)) return { kind: 'nodo', id: node.id };
  }
  const activation = geometry.activations?.find((a) => visible(a.lifeline) && point.x >= a.x && point.x <= a.x + a.width && point.y >= a.y1 && point.y <= a.y2);
  if (activation !== undefined) return { kind: 'nodo', id: activation.lifeline };
  const line = Object.entries(geometry.lifelines ?? {}).find(([id, l]) => visible(id) && Math.abs(point.x - l.x) <= tolerance && point.y >= l.y1 && point.y <= l.y2);
  if (line !== undefined) return { kind: 'nodo', id: line[0] };

  // Fragments: the most nested wins; only the tab and the border count.
  const frames = [...(geometry.fragments ?? [])].filter((m) => visible(idOf(m.ruta))).sort((a, b) => b.nivel - a.nivel);
  const frame = frames.find((m) => {
    const inner = point.x > m.x + tolerance && point.x < m.x + m.width - tolerance && point.y > m.y + tolerance && point.y < m.y + m.height - tolerance;
    return contains(m.tab, point) || (contains(m, point, tolerance) && !inner);
  });
  return frame === undefined ? undefined : { kind: 'fragmento', id: idOf(frame.ruta) };
}

/** Canvas box of an element (to mark it); `undefined` if it no longer exists in the View or the geometry. */
export function elementBox(view: ResolvedView, geometry: Geo, theme: Theme, element: SelectableElement): NodeBox | undefined {
  const { boxes } = geometryIndex(view, geometry);
  if (element.kind === 'nodo') return boxes.get(element.id);
  if (element.kind === 'atributo') {
    const { table } = resolveStyle(theme, view.type);
    const [nodeIdent = '', name] = element.id.split('#');
    const node = inDrawOrder(geometryIndex(view, geometry).roots).find((n) => n.id === nodeIdent);
    const box = boxes.get(nodeIdent);
    const metrics = node === undefined ? table.base : leafMetrics(table, node);
    const attributes = node === undefined ? [] : visibleAttributes(node, metrics);
    const index = attributes.findIndex((a) => a.name === name);
    if (node === undefined || box === undefined || index < 0) return undefined;
    const row = placeInBox(metrics, nodeContent(node, metrics), box.width).filas[index]!;
    return { x: box.x + row.x, y: box.y + row.y, width: row.width, height: row.height };
  }
  if (element.kind === 'mensaje' || element.kind === 'nota' || element.kind === 'fragmento') {
    const path = elementPath(view, element.id) ?? '';
    if (element.kind === 'nota') return geometry.notes?.find((n) => n.ruta === path);
    if (element.kind === 'fragmento') return geometry.fragments?.find((m) => m.ruta === path);
    const points = geometry.messages?.[path]?.points ?? [];
    if (points.length < 2) return undefined;
    const [x, y] = [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y))];
    return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
  }
  const edge = view.type === 'sequence' ? undefined : view.edges.find((a) => edgeId(a) === element.id);
  const points = geometry.edges?.[element.id]?.points ?? [];
  if (edge === undefined || points.length < 2) return undefined;
  if (element.kind === 'etiqueta') {
    return edge.label === undefined ? undefined : labelBox(edge.label, points, geometry.labels?.[element.id], resolveStyle(theme, view.type));
  }
  const [xs, ys] = [points.map((p) => p.x), points.map((p) => p.y)];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Elements in selection order, without repeats. */
export type Selection = readonly SelectableElement[];
export const EMPTY_SELECTION: Selection = [];

export type SelectionMode = 'reemplazar' | 'agregar' | 'quitar' | 'alternar';

const same = (a: SelectableElement, b: SelectableElement): boolean => a.kind === b.kind && a.id === b.id;

/** Selection that results from applying `element` with `mode`; does not mutate the input. */
export function select(selection: Selection, element: SelectableElement, mode: SelectionMode): Selection {
  const present = selection.some((e) => same(e, element));
  switch (mode) {
    case 'reemplazar':
      return [element];
    case 'agregar':
      return present ? selection : [...selection, element];
    case 'quitar':
      return selection.filter((e) => !same(e, element));
    case 'alternar':
      return present ? selection.filter((e) => !same(e, element)) : [...selection, element];
  }
}

/**
 * The View element that `id` names (it may come from a Selection stored in the hash): `node#attribute`
 * is an Attribute, an `edgeId` is an Edge and the rest is taken as a Node even if it no longer exists.
 */
export function elementById(view: ResolvedView, id: string): SelectableElement {
  const ofSequence = sequenceElement(view, id);
  if (ofSequence !== undefined) return ofSequence;
  if (view.type !== 'sequence' && view.edges.some((edge) => edgeId(edge) === id)) return { kind: 'arista', id };
  return { kind: id.includes('#') ? 'atributo' : 'nodo', id };
}

/** Path of element `id` inside the View's Interaction; `undefined` if `id` is not from that Interaction (or the View is not a sequence one). */
function elementPath(view: ResolvedView, id: string): string | undefined {
  if (view.type !== 'sequence') return undefined;
  const parsed = parseSequenceElementId(id);
  return parsed !== undefined && parsed.operand === undefined && parsed.interaction === view.interaction.id ? parsed.path : undefined;
}

function flatItems(items: readonly ResolvedItem[]): ResolvedItem[] {
  return items.flatMap((item) => (item.type === 'fragment' ? [item, ...item.operands.flatMap((o) => flatItems(o.items))] : [item]));
}

/** Message, Fragment (or `ref`) or Note that `interaction:path` names in a sequence View. */
function sequenceElement(view: ResolvedView, id: string): SelectableElement | undefined {
  const path = elementPath(view, id);
  if (view.type !== 'sequence' || path === undefined) return undefined;
  const item = flatItems(view.interaction.items).find((i) => (i.type === 'message' ? i.message.path : i.path) === path);
  if (item === undefined) return undefined;
  return { kind: item.type === 'message' ? 'mensaje' : item.type === 'note' ? 'nota' : 'fragmento', id };
}

/**
 * View that pressing the `ref` `id` (`interaction:path`) navigates to: the first sequence View that projects the referenced
 * Interaction (`refTarget`). `undefined` if `id` is not a `ref`, there is no target View or that View is the current one (inert, no notice).
 */
export function refNavigationTarget(view: ResolvedView, current: string, viewList: readonly Pick<View, 'id' | 'type' | 'interaction'>[], id: string): string | undefined {
  const path = elementPath(view, id);
  if (view.type !== 'sequence' || path === undefined) return undefined;
  const item = flatItems(view.interaction.items).find((i) => i.type === 'ref' && i.path === path);
  if (item === undefined || item.type !== 'ref') return undefined;
  const target = refTarget(viewList, item.interaction);
  return target === current ? undefined : target;
}
