/**
 * Scene of a View: the element tree `Diagram` draws. Over the page, three flat layers in absolute
 * coordinates (HTML Groups, SVG Edges, HTML Nodes) under a single pan/zoom `transform`, so HTML and SVG stay aligned
 * at any zoom. Pure: the same input gives the same tree. Attribute values go unescaped: React escapes them.
 */
import { edgeId, sequenceElementId } from 'canonical';
import type { ResolvedEdge, NodeBox, Geometry, GraphGeometry, IconProvider, ResolvedNode, Theme, Visibility, GraphView, ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';
import { STATES, visibleAttributes, placeInBox, nodeContent, leafMetrics } from 'theme';
import type { Metrics } from 'theme';

import { paintAnimatedLayers } from './animation';
import { strokeFilters } from './edges';
import { paintCode } from './code';
import type { ThemeComponents } from './code';
import { cleanCssValue, num } from './element';
import type { MarkupElement } from './element';
import { elementEffects } from './effects';
import { resolveStyle } from './style';
import type { VisualState, Style } from './style';
import { compileSheet } from './sheet';
import { ELEMENTS, nodeStack, elementPaint } from './stacks';
import { buildSequenceScene } from './sequence';
import { paintEdge, paintControl, paintBoxState, paintPathState, paintEdgeLabel, paintGroup, paintNode, paintZones } from './painters';

export type { MarkupElement } from './element';

/** Visible window of the canvas, in geometry units. */
export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every level draws the View `label`; `completo` adds the Attributes. Boxes, paths and camera do not change. */
export type DetailLevel = 'etiqueta' | 'titulo' | 'completo';

/** Visual states per element id (Node, Edge or `node#attribute`); an element may have several. */
export type States = Readonly<Record<string, readonly VisualState[]>>;

export interface SceneInput {
  /** View already resolved with its collapse (`resolveView`); render keeps no collapse state. */
  view: ResolvedView;
  geometry: Geometry;
  theme: Theme;
  icons?: IconProvider;
  width: number;
  height: number;
  /** Visibility 0..1 of Nodes and Edges; without it, everything is 1. */
  visibility?: Visibility;
  camera?: Camera;
  /** Without it, like `completo`. */
  detail?: DetailLevel;
  onSelect?: (id: string) => void;
  /** With it, every Group (or collapsed Group without a link) carries a collapse control; it only notifies, the collapse comes in `view`. */
  onToggle?: (id: string) => void;
  /** Metrics to draw with; they must be the layout's. By default the ones derived from the Theme. */
  metrics?: Metrics;
  /**
   * Visual states per id; an id that is not drawn is ignored. `dimmed` lowers the opacity without an outline and the `focus`
   * ring does not go below `MIN_FOCUS_RING` px.
   */
  states?: States;
  /** Resolved Style to draw with; by default the Theme's (`resolveStyle`). */
  style?: Style;
  /** URL of a Workspace font file; with it the drawing declares the `@font-face`s of `style.faces`. */
  fontUrl?: (path: string) => string;
  /** Reduced-motion: `on` always reduces, `off` never; without it, `prefers-reduced-motion` decides. */
  reducedMotion?: 'on' | 'off';
  /** Freshly revealed ids (a Step): the `enter` `stagger` counts only among them; without it, among all visible ones. */
  fresh?: readonly string[];
  /** Theme components (`code` Layer) by name. A name without a component leaves its container empty; one that throws only loses its Layer. */
  components?: ThemeComponents;
}

export interface Context extends SceneInput {
  visibility: Visibility;
  style: Style;
  /** Boxes in canvas coordinates (the geometry's are relative to the parent Group). */
  boxes: ReadonlyMap<string, NodeBox>;
  /** Accessible name of each Node, taken only from the Model (never from the Theme). */
  names?: ReadonlyMap<string, string>;
  /** Palette color of each Node: its kind's or override; an Edge's `ORIGIN` takes its source's. */
  nodeColors: ReadonlyMap<string, string | undefined>;
  /** Position of each Node in the `enter` stagger; empty if the Theme declares no `stagger`. */
  stagger: ReadonlyMap<string, number>;
}

type GraphContext = Context & { view: GraphView; geometry: GraphGeometry };

/**
 * Throws if a Node of the View is not in the geometry, if the Geometry is of another Diagram type than the View or if
 * the Theme does not satisfy the contract.
 */
export function buildScene(given: SceneInput): MarkupElement {
  const input = withPlannedOnes(given);
  const { view, geometry } = input;
  switch (view.type) {
    case 'sequence':
      if (geometry.kind !== 'secuencia') throw new Error(`buildScene: the View is a sequence and the Geometry is '${geometry.kind}'`);
      return buildSequenceScene({ ...input, view, geometry });
    case 'architecture':
    case 'flow':
    case 'er':
      if (geometry.kind !== 'grafo') throw new Error(`buildScene: the View is '${view.type}' and the Geometry is '${geometry.kind}'`);
      return buildGraphScene({ ...input, view, geometry });
  }
}

/**
 * What is Planned in the Model (ADR 0011, already inherited in the resolved View) is one more visual state: `planned` goes before
 * the caller's states on each marked Node, Edge, Message and Attribute (the latter only with its own mark).
 */
function withPlannedOnes(input: SceneInput): SceneInput {
  const { view } = input;
  const ids = [
    ...view.nodes.filter((node) => node.planned === true).map((node) => node.id),
    ...view.nodes.flatMap((node) => node.attributes.filter((attribute) => attribute.planned === true).map((attribute) => `${node.id}#${attribute.name}`)),
    ...(view.type === 'sequence'
      ? view.interaction.messages.filter((message) => message.planned === true).map((message) => sequenceElementId(view.interaction.id, message.path))
      : view.edges.filter((edge) => edge.planned === true).map(edgeId)),
  ];
  if (ids.length === 0) return input;
  const states: Record<string, readonly VisualState[]> = { ...input.states };
  for (const id of ids) states[id] = ['planned', ...(states[id] ?? []).filter((state) => state !== 'planned')];
  return { ...input, states };
}

function buildGraphScene(input: SceneInput & { view: GraphView; geometry: GraphGeometry }): MarkupElement {
  const { view, geometry, theme } = input;
  const style = input.style ?? resolveStyle(theme, input.view.type, input.metrics);
  const { roots, boxes } = geometryIndex(view, geometry);
  const visibility = input.visibility ?? (() => 1);
  const nodeColors = new Map(roots.flatMap((root) => flatten(root)).map((node) => [node.id, node.color]));
  const context: GraphContext = { ...input, visibility, style, boxes, nodeColors, stagger: staggerPositions(roots, visibility, style, input.fresh) };
  const nodes = roots.flatMap((node) => flatten(node));
  context.names = accessibleNames(view.edges, nodes);

  return sceneFrame(input, style, [
    { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, children: nodes.filter(isGroup).map((node) => nodeBox(node, context)) },
    layerSvg('aristas', geometry, [
      ...strokeFilters(style, geometry.width, geometry.height),
      ...view.edges.flatMap((edge) => edgeSvg(edge, context)),
      ...view.edges.flatMap((edge) => labelSvg(edge, context)),
    ]),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, children: nodes.filter((n) => !isGroup(n)).map((node) => nodeBox(node, context)) },
  ]);
}

/** SVG layer of strokes (Edges, or Lifelines and Messages) at geometry size. */
export function layerSvg(layer: string, geometry: { width: number; height: number }, children: MarkupElement[]): MarkupElement {
  return {
    tag: 'svg',
    attrs: {
      class: 'rd-capa rd-aristas',
      'data-capa': layer,
      xmlns: 'http://www.w3.org/2000/svg',
      width: num(geometry.width),
      height: num(geometry.height),
      viewBox: `0 0 ${num(geometry.width)} ${num(geometry.height)}`,
      'aria-hidden': 'true',
    },
    children: children,
  };
}

/**
 * Common frame of every scene: `[data-diagram]` container with style sheet, page background and the world with the
 * camera (a single `transform`), which carries the `layers` in stacking order.
 */
export function sceneFrame(input: SceneInput, style: Style, layers: MarkupElement[]): MarkupElement {
  const { geometry, width, height, camera } = input;
  const view = camera ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };
  const sheet = compileSheet(style, input.fontUrl);

  // Same framing as a `viewBox` with the default `preserveAspectRatio`: uniform scale, centered.
  const k = Math.min(width / view.width, height / view.height);
  const tx = (width - view.width * k) / 2 - view.x * k;
  const ty = (height - view.height * k) / 2 - view.y * k;

  const { pagina: page } = style.paint;
  // Fixed to the viewer: sibling of the world. Not fixed: inside the world, with a margin to cover the viewer when zooming out or panning.
  const background = (extra: string): MarkupElement => ({ tag: 'div', attrs: { class: 'rd-pagina', 'data-capa': 'pagina', ...(extra !== '' && { style: extra }) }, children: [] });
  const fixedPage = page.capas.length > 0 && page.fijo ? [background('')] : [];
  const movingPage =
    page.capas.length > 0 && !page.fijo
      ? [background(`left:${num(-PAGE_MARGIN)}px;top:${num(-PAGE_MARGIN)}px;width:${num(geometry.width + 2 * PAGE_MARGIN)}px;height:${num(geometry.height + 2 * PAGE_MARGIN)}px;`)]
      : [];

  return {
    tag: 'div',
    attrs: {
      class: sheet.className,
      'data-diagram': '',
      'data-camara': `${num(view.x)} ${num(view.y)} ${num(view.width)} ${num(view.height)}`,
      ...(input.reducedMotion !== undefined && { 'data-reduced-motion': input.reducedMotion }),
      style: `width:${num(width)}px;height:${num(height)}px;`,
    },
    children: [
      { tag: 'style', attrs: {}, html: sheet.css },
      ...fixedPage,
      {
        tag: 'div',
        attrs: {
          class: 'rd-mundo',
          style: `width:${num(geometry.width)}px;height:${num(geometry.height)}px;transform:translate(${num(tx)}px,${num(ty)}px) scale(${num(k)});`,
        },
        children: [...movingPage, ...layers],
      },
    ],
  };
}

/** How much the page that moves with the camera sticks out, in canvas units. */
const PAGE_MARGIN = 4000;

const isGroup = (node: ResolvedNode): boolean => node.children.length > 0;

/**
 * Accessible name of each Node: label, Node kind and relations ("va a" / "viene de"). It comes only from the Model, never from the
 * Theme; the Edge SVG is decorative, so the relation is announced here.
 */
export function accessibleNames(edges: readonly ResolvedEdge[], nodes: readonly ResolvedNode[]): Map<string, string> {
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const target = (id: string, edge: ResolvedEdge): string => `${label.get(id) ?? id}${edge.label === undefined ? '' : ` (${edge.label})`}`;
  return new Map(
    nodes.map((node) => {
      const exits = edges.filter((e) => e.from.node === node.id).map((e) => target(e.to.node, e));
      const enters = edges.filter((e) => e.to.node === node.id).map((e) => target(e.from.node, e));
      const parts = [
        node.label,
        node.type,
        ...(node.childCount > 0 ? [`group with ${node.childCount} children${node.collapsed ? ', collapsed' : ''}`] : []),
        ...(exits.length > 0 ? [`va a ${exits.join(', ')}`] : []),
        ...(enters.length > 0 ? [`comes from ${enters.join(', ')}`] : []),
      ];
      return [node.id, parts.join(', ')];
    }),
  );
}

/**
 * Position of each visible Node in the `enter` `stagger`: in drawing order, among the
 * `fresh` ones if given or among all visible ones. Empty without `stagger` in the Theme.
 */
export function staggerPositions(roots: readonly ResolvedNode[], visibility: Visibility, style: Style, fresh?: readonly string[]): Map<string, number> {
  const positions = new Map<string, number>();
  if (ELEMENTS.every((key) => elementPaint(style.paint, key).animacion?.escalonadoMs === undefined)) return positions;
  const chosen = fresh === undefined ? undefined : new Set(fresh);
  for (const node of roots.flatMap((root) => flatten(root))) {
    if (clamp(visibility(node.id)) > 0 && (chosen === undefined || chosen.has(node.id))) positions.set(node.id, positions.size);
  }
  return positions;
}

/** Nodes in preorder (a Group before its children): the stacking order inside each layer. */
export function flatten(node: ResolvedNode): ResolvedNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/**
 * Inline style of a Node/Group box: its absolute position and size (the only values that come from the geometry)
 * and its tilt. The tilt goes in the same `transform`, after the translation: it rotates the box around its center without moving it
 * (the `rotate` property would apply before the translation and shift it).
 */
function position(box: NodeBox, tiltDeg = 0): string {
  return `width:${num(box.width)}px;height:${num(box.height)}px;transform:translate(${num(box.x)}px,${num(box.y)}px)${tiltDeg === 0 ? '' : ` rotate(${num(tiltDeg)}deg)`};`;
}

export function nodeBox(node: ResolvedNode, context: Context): MarkupElement {
  const box = context.boxes.get(node.id);
  if (box === undefined) throw new Error(`Node '${node.id}' is not in the geometry`);
  const { style, onSelect, onToggle, icons, detail } = context;
  const group = isGroup(node);
  const { key, kind, stack } = nodeStack(style.paint, node);
  const stroke = strokeColor(node, style);
  // The View `label` (override or, if none, the title) wins at every level.
  const data = { node, box, stroke, text: node.label, icons, ...(context.states !== undefined && { states: context.states }) };
  const toggleable = group || (node.collapsed && node.link === undefined);
  const effects = elementEffects(style, stack, node.id);
  // Without its own `planned` patch, the box takes the default look: dimmed and with a dashed outline.
  const defaultPlanned = plannedLook(context.states, node.id) && stack.estados.planned === undefined;
  const code = {
    node,
    width: box.width,
    height: box.height,
    stroke,
    states: context.states?.[node.id] ?? [],
    hasContent: group ? node.children.length > 0 : hasRows(node, style, detail),
    components: context.components,
  };

  return {
    tag: 'div',
    attrs: { class: 'rd-caja', 'data-id': node.id, 'data-elemento': key, ...(kind !== undefined && { 'data-tipo': kind }), ...(dimmedOne(context.states, node.id) && { 'data-atenuado': '' }), ...(defaultPlanned && { 'data-planeado': '' }), style: position(box, effects.tiltDeg) },
    children: [
      {
        tag: 'div',
        attrs: {
          class: `rd-${key}`,
          'data-part': 'nodo',
          ...(kind !== undefined && { 'data-tipo': kind }),
          role: 'group',
          'aria-label': context.names?.get(node.id) ?? node.label,
          ...(node.collapsed && { 'data-collapsed': '' }),
          ...(clamp(context.visibility(node.id)) === 0 && { 'data-oculto': '' }),
          ...((context.states?.[node.id]?.length ?? 0) > 0 && { 'data-estados': (context.states?.[node.id] ?? []).join(' ') }),
          style: `--trazo:${cleanCssValue(stroke)};--rd-ancho:${num(box.width)};--rd-alto:${num(box.height)};${context.stagger.has(node.id) ? `--rd-n:${context.stagger.get(node.id)};` : ''}${opacity(context.visibility(node.id))}${effects.node}`,
        },
        ...(onSelect !== undefined && { onClick: () => onSelect(node.id) }),
        children: [
          ...effects.below,
          ...(group ? [] : paintZones(style, data, stack.capas)),
          ...paintAnimatedLayers(stack, false),
          ...paintCode(style, stack, code, false),
          ...(group ? paintGroup(style, data) : paintNode(style, { ...data, withAttributes: hasRows(node, style, detail) })),
          ...paintAnimatedLayers(stack, true),
          ...paintCode(style, stack, code, true),
          ...(onToggle !== undefined && toggleable ? [paintControl(style, { node, box, onClick: () => onToggle(node.id) })] : []),
          ...effects.above,
        ],
      },
      ...(defaultPlanned ? [paintBoxState('planned', node.id)] : []),
      ...nodeStates(node, box, context),
    ],
  };
}

function nodeStates(node: ResolvedNode, box: NodeBox, { states, style, detail }: Context): MarkupElement[] {
  if (states === undefined) return [];
  const ownOnes = outlines(states[node.id]).map((e) => paintBoxState(e, node.id));
  if (isGroup(node) || !hasRows(node, style, detail)) return ownOnes;
  const metrics = leafMetrics(style.table, node);
  const attributes = visibleAttributes(node, metrics);
  const straight = placeInBox(metrics, nodeContent(node, metrics), box.width).filas;
  const rows = attributes.flatMap((attribute, i) => {
    const id = `${node.id}#${attribute.name}`;
    return outlines(states[id]).map((e) => paintBoxState(e, id, straight[i]!));
  });
  return [...ownOnes, ...rows];
}

/** `dimmed` has no outline: it dims the whole element (`data-atenuado` mark, styled by the sheet). */
export const dimmedOne = (states: States | undefined, id: string): boolean => states?.[id]?.includes('dimmed') === true;
/** `planned` dims the element (`data-planeado` mark) and dashes its lines; its box outline is set by whoever draws it. */
export const plannedLook = (states: States | undefined, id: string): boolean => states?.[id]?.includes('planned') === true;
/**
 * `dimmed` and `planned` marks of a stroke (Edge, Message, Lifeline) or of its label. With `ownPlanned` (the
 * Theme patches `planned` for that stroke) there is no `data-planeado`: the Theme's stack replaces the default look.
 */
export const strokeMarks = (states: States | undefined, id: string, ownPlanned = false): Record<string, string> => ({
  ...(dimmedOne(states, id) && { 'data-atenuado': '' }),
  ...(plannedLook(states, id) && !ownPlanned && { 'data-planeado': '' }),
});

/** The stack of the state that rules a stroke: the last of `STATES` that `id` carries and the Theme declares (paint-only). */
export function strokeState<T>(declaredOnes: Partial<Record<VisualState, T>> | undefined, states: States | undefined, id: string): T | undefined {
  const active = states?.[id] ?? [];
  const current = STATES.filter((state) => active.includes(state) && declaredOnes?.[state] !== undefined).at(-1);
  return current === undefined ? undefined : declaredOnes?.[current];
}
/** States with their own outline over the element: all but `dimmed` and `planned`. */
export const outlines = (list: readonly VisualState[] | undefined): VisualState[] => (list ?? []).filter((e) => e !== 'dimmed' && e !== 'planned');

function hasRows(node: ResolvedNode, style: Style, detail?: DetailLevel): boolean {
  return (detail === undefined || detail === 'completo') && visibleAttributes(node, leafMetrics(style.table, node)).length > 0;
}

/** Palette value for the Node color; without a color, or an unknown one, the Style border. */
export function strokeColor(node: ResolvedNode, style: Style): string {
  return (node.color !== undefined ? style.palette[node.color] : undefined) ?? style.border;
}

/** Edge with its label. An Edge without a path in the geometry (ELK did not route it) is skipped. */
function edgeSvg(edge: ResolvedEdge, { view, geometry, style, onSelect, visibility, states, nodeColors }: GraphContext): MarkupElement[] {
  const id = edgeId(edge);
  const points = geometry.edges[id]?.points;
  if (points === undefined || points.length < 2) return [];
  const v = svgVisibility(visibility(id));
  const sourceColor = nodeColors.get(edge.from.node);
  const ofTheme = (sourceColor === undefined ? undefined : style.paint.arista.origenes[sourceColor]) ?? style.paint.arista;
  const inState = strokeState(ofTheme.estadosDeArista, states, id);
  return [
    paintEdge(style, {
      id,
      points: points,
      ...(sourceColor !== undefined && { origin: sourceColor }),
      from: edge.fromCardinality,
      to: edge.toCardinality,
      ...(view.type === 'er' && { er: { identificante: edge.identifying === true } }),
      ...(inState !== undefined && { inState }),
      attributes: { ...v, ...strokeMarks(states, id, ofTheme.estadosDeArista?.planned !== undefined) },
      extra: outlines(states?.[id]).map((e) => paintPathState(style, e, id, points)),
      ...(onSelect !== undefined && { onClick: () => onSelect(id) }),
    }),
  ];
}

/**
 * Label of an Edge, in a pass after all strokes so that
 * no stroke (of this or another Edge) covers it. It inherits the visibility,
 * dimming and click of its Edge.
 */
function labelSvg(edge: ResolvedEdge, { geometry, style, onSelect, visibility, states, nodeColors }: GraphContext): MarkupElement[] {
  const id = edgeId(edge);
  const points = geometry.edges[id]?.points;
  if (edge.label === undefined || points === undefined || points.length < 2) return [];
  const v = svgVisibility(visibility(id));
  const sourceColor = nodeColors.get(edge.from.node);
  const ofTheme = (sourceColor === undefined ? undefined : style.paint.arista.origenes[sourceColor]) ?? style.paint.arista;
  return [
    {
      tag: 'g',
      attrs: { 'data-edge-labels': id, ...v, ...strokeMarks(states, id, ofTheme.estadosDeArista?.planned !== undefined) },
      ...(onSelect !== undefined && { onClick: () => onSelect(id) }),
      children: [paintEdgeLabel(style, { id, text: edge.label, points, box: geometry.labels[id] })],
    },
  ];
}

/** Visibility clamped to [0, 1]; a NaN counts as 0. */
export function clamp(visibilityValue: number): number {
  return Number.isNaN(visibilityValue) ? 0 : Math.min(Math.max(visibilityValue, 0), 1);
}

/** Inline `opacity` only if it is not 1. With 0 it gets no clicks. */
export function opacity(visibilityValue: number): string {
  const value = clamp(visibilityValue);
  if (value === 1) return '';
  return value === 0 ? 'opacity:0;pointer-events:none;' : `opacity:${num(value)};`;
}

/** The same for an SVG element, as attributes. */
export function svgVisibility(visibilityValue: number): Record<string, string> {
  const value = clamp(visibilityValue);
  if (value === 1) return {};
  return value === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(value) };
}
