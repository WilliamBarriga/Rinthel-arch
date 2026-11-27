/**
 * Painters per part: they read only from the resolved Style, with no numbers of their own. Nodes and Groups are HTML (each Slot in the
 * rectangle `layout` reserved; CSS only paints and clips); Edges and their labels are SVG. Pure.
 */
import { sanitizeIcon } from 'canonical';
import type { Attribute, NodeBox, IconProvider, ResolvedNode } from 'canonical';
import { STATES, ER_MARKER_LENGTH, headerHeight, erEdgeLayers, rowStack, keyChips, placeInBox, nodeContent, leafMetrics, labelSize, attributeText, slotText } from 'theme';
import type { NodeContent, State, Metrics, PrimitiveName, SlotName, TextSlotName, EdgePaint, NodePaint, PaintedPrimitive, Rect } from 'theme';

import { paintMarkers, paintStrokes, layerPath } from './edges';
import { cleanDeclarations, cleanCssValue, num } from './element';
import type { MarkupElement } from './element';
import { boxDeclarations, textDeclarations } from './sheet';
import { elementEffects } from './effects';
import { stateLook } from './style';
import type { VisualState, Style } from './style';
import { nodeStack } from './stacks';
import { isZoneLayer } from './paint/common';

type Point = { x: number; y: number };

export interface NodeData {
  node: ResolvedNode;
  box: NodeBox;
  /** Stroke color already resolved from the Palette. */
  stroke: string;
  /** Text of the Node label (the title of an open Group; a leaf Node uses the one `nodeContent` gives). */
  text: string;
  icons?: IconProvider;
  /** Visual states per element id; an ER row's go under `node#attribute` and are painted with the `row` state stack. */
  states?: Readonly<Record<string, readonly VisualState[]>>;
}

/** `left/top/width/height` in px of a rectangle (relative to its containing box). */
function inRect(r: Rect, extra = ''): string {
  return `left:${num(r.x)}px;top:${num(r.y)}px;width:${num(r.width)}px;height:${num(r.height)}px;${extra}`;
}

/** Text Slot: an absolute `div` exactly on its rectangle; CSS only clips (ellipsis). */
function textSlot(name: string, classNames: string, r: Rect, text: string, extra = ''): MarkupElement {
  return { tag: 'div', attrs: { class: `rd-slot ${classNames}`, 'data-slot': name, style: inRect(r, `line-height:${num(r.height)}px;${extra}`) }, children: [text] };
}

interface SlotContext {
  style: Style;
  data: NodeData;
  /** Attributes that are drawn (empty if the detail level hides them). */
  attributes: readonly Attribute[];
  /** Text style of the Slots of the element being drawn (Node, open or collapsed Group). */
  texts: NodePaint['textos'];
  metrics: Metrics;
  contents: NodeContent;
}

/** Single-line text Slot, with the size the placement reserved (and the text `layout` measured). */
function paintText(slot: TextSlotName, { metrics, contents, texts }: SlotContext, rect: Rect): MarkupElement[] {
  const measured = slotText(slot, metrics, contents);
  if (measured === undefined) return [];
  const fontSizeValue = measured.tamano === metrics.fontSize ? '' : `font-size:${num(measured.tamano)}px;`;
  // The counter is a box with a border: its text is centered inside.
  const border = texts.counter?.props['border'] === undefined ? 0 : Number(texts.counter.props['border-width'] ?? 1);
  return [textSlot(slot, `rd-${slot}`, rect, measured.texto, slot === 'counter' ? `${fontSizeValue}line-height:${num(rect.height - 2 * border)}px;` : fontSizeValue)];
}

/** One painter per catalog Slot (a Slot without a painter breaks the typecheck), on the rectangle the `theme` placement gave. */
const SLOT_PAINTERS: { readonly [S in SlotName]: (context: SlotContext, rect: Rect) => MarkupElement[] } = {
  title: (context, rect) => paintText('title', context, rect),
  badge: (context, rect) => paintText('badge', context, rect),
  desc: (context, rect) => paintText('desc', context, rect),
  footer: (context, rect) => paintText('footer', context, rect),
  counter: (context, rect) => paintText('counter', context, rect),
  icon: ({ data, texts }, rect) => paintIcon(texts, data.node, data.stroke, data.icons, rect),
  attrs: ({ style, data, attributes, metrics }, rect) => (attributes.length === 0 ? [] : [paintAttributes(style, data.node.id, attributes, rect, metrics, data.states)]),
};

/** Each Slot the Theme lists for `metrics`, on its rectangle inside a box of `width`. `withAttributes`: whether the `attrs` rows are drawn. */
function paintSlots(style: Style, data: NodeData, metrics: Metrics, width: number, withAttributes: boolean): MarkupElement[] {
  const contents = nodeContent(data.node, metrics);
  const { slots } = placeInBox(metrics, contents, width);
  const context = { style, data, metrics, contents, attributes: withAttributes ? contents.atributos : [], texts: nodeStack(style.paint, data.node).stack.textos };
  return (Object.keys(slots) as SlotName[]).flatMap((slot) => SLOT_PAINTERS[slot](context, slots[slot]!));
}

/** Content of a Node (leaf, or collapsed Group): each Slot the Theme lists, on its rectangle. */
export function paintNode(style: Style, data: NodeData & { withAttributes: boolean }): MarkupElement[] {
  return paintSlots(style, data, leafMetrics(style.table, data.node), data.box.width, data.withAttributes);
}

/**
 * Layers with `zone`: each one is its own element over its band of the box. `header` goes from the top to where
 * `attrs` starts (without `attrs`, the whole box); `body` covers the `attrs` zone down to the foot (without `attrs`, nothing). It inherits the
 * corners of the box it touches. It only paints: a state patch does not change them.
 */
export function paintZones(style: Style, data: NodeData, layers: readonly NodePaint['capas'][number][]): MarkupElement[] {
  const ofZones = layers.filter(isZoneLayer);
  if (ofZones.length === 0) return [];
  const metrics = leafMetrics(style.table, data.node);
  const { slots } = placeInBox(metrics, nodeContent(data.node, metrics), data.box.width);
  const rows = slots.attrs;
  return ofZones.flatMap((layer): MarkupElement[] => {
    const header = layer.props['zone'] === 'header';
    const from = rows === undefined ? (header ? 0 : data.box.height) : header ? 0 : rows.y;
    const to = rows === undefined || !header ? data.box.height : rows.y;
    if (to <= from) return [];
    const corners = header ? 'border-top-left-radius:inherit;border-top-right-radius:inherit;' : 'border-bottom-left-radius:inherit;border-bottom-right-radius:inherit;';
    // Slots shift by the border width (`--rd-borde`): the zone band follows that cut line.
    const atBorder = `height:calc(${num(to - from)}px - var(--rd-borde, 0px));${header ? '' : 'margin-top:calc(-1 * var(--rd-borde, 0px));'}`;
    const paint = atBorder + cleanDeclarations(boxDeclarations(style, { capas: [layer], estados: {} }, [layer], true));
    return [{ tag: 'div', attrs: { class: 'rd-zona', 'data-zona': String(layer.props['zone']), 'data-capa': layer.nombre, 'aria-hidden': 'true', style: inRect({ x: 0, y: from, width: data.box.width, height: to - from }, `${corners}${paint}`) } }];
  });
}

/**
 * Head of an open Group: the Slots of its `group` layout (its children are Nodes of other layers), on the
 * band `layout` reserved above them; the collapse control's spot is on the right.
 */
export function paintGroup(style: Style, data: NodeData): MarkupElement[] {
  const metrics = style.table.grupoAbierto;
  return paintSlots(style, data, metrics, Math.max(0, data.box.width - 2 * metrics.margenDeControl), false);
}

/**
 * Icon of the Node kind inside `rect`. Variants: `plain` (the glyph),
 * `box` (glyph in a box with radius, fill and border) and `dot` (colored dot,
 * no glyph). The glyph is only embedded if it passes `sanitizeIcon`; the look of the
 * box and the dot comes from the sheet.
 */
function paintIcon(texts: NodePaint['textos'], node: ResolvedNode, stroke: string, icons: IconProvider | undefined, rect: Rect): MarkupElement[] {
  const variantName = String(texts.icon?.props['variant'] ?? 'plain');
  // A dot is the color of the Node kind and needs no glyph: it shows even if the kind declares no icon.
  if (node.icon === undefined && variantName !== 'dot') return [];
  const glyph = texts.icon?.props['glyph'];
  const attributes = { class: 'rd-icono', 'data-slot': 'icon', ...(node.icon !== undefined && { 'data-icon': node.icon }), 'data-variante': variantName, style: inRect(rect, `color:${cleanCssValue(String(texts.icon?.props['color'] ?? stroke))};`) };
  if (variantName === 'dot') return [{ tag: 'div', attrs: attributes }];
  const raw = node.icon === undefined ? undefined : icons?.resolve(node.icon);
  const svg = raw === undefined ? undefined : sanitizeIcon(raw);
  if (svg === undefined) return variantName === 'box' ? [{ tag: 'div', attrs: attributes }] : [];
  // In a box the glyph leaves a margin (or measures `glyph`); loose it takes the whole rectangle.
  const available = Math.min(rect.width, rect.height);
  const side = num(glyph !== undefined ? Math.min(Number(glyph), available) : variantName === 'box' ? Math.round(available * 0.6) : available);
  const sized = svg.replace(/<svg\b([^>]*)>/, (_, svgAttributes: string) => {
    const withoutMeasures = svgAttributes.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, '');
    return `<svg width="${side}" height="${side}"${withoutMeasures}>`;
  });
  return [{ tag: 'div', attrs: attributes, html: sized }];
}

/** State that rules a row: the last of `STATES` it carries (the Nodes' sheet order). */
const rowState = (list: readonly VisualState[] | undefined): State | undefined => STATES.filter((state) => list?.includes(state) === true).at(-1);

/** Inline style of a row text (`name`, `type`, `key`) the Theme declares; empty otherwise. */
const inline = (text: PaintedPrimitive | undefined, style: Style, fontSizeValue?: number): string =>
  text === undefined ? '' : cleanDeclarations({ ...textDeclarations(text, style.monoFont), ...(fontSizeValue !== undefined && { 'font-size': `${num(fontSizeValue)}px` }) });

/**
 * `attrs` Slot: one row per Attribute, in order, each one on its rectangle (relative to the Slot). In an ER View the row
 * paints the Style's `row` stack (depending on whether it is odd, its key marks and whether it is optional) and its `name`, `type`
 * and `key` texts with their style.
 */
function paintAttributes(style: Style, id: string, attributes: readonly Attribute[], zone: Rect, nodeMetrics: Metrics, states?: NodeData['states']): MarkupElement {
  const { metrics } = style;
  const marks = nodeMetrics.marcasDeClave === true;
  const ofTheme = marks ? style.paint.fila : undefined;
  return {
    tag: 'div',
    attrs: { class: `rd-slot rd-attrs${zone.y > 0 ? ' rd-separado' : ''}`, 'data-slot': 'attrs', style: inRect(zone) },
    children: attributes.map((attribute, i) => {
      const layers = ofTheme === undefined ? [] : rowStack(ofTheme, { odd: i % 2 === 1, keys: attribute.keys ?? [], optional: attribute.optional === true }, rowState(states?.[`${id}#${attribute.name}`]));
      const effects = layers.length === 0 ? undefined : elementEffects(style, { capas: layers }, `${id}#${attribute.name}`);
      const box = layers.length === 0 ? '' : cleanDeclarations(boxDeclarations(style, { capas: layers, estados: {} }, layers.filter((c) => !isZoneLayer(c))));
      return {
        tag: 'div',
        attrs: {
          class: 'rd-fila',
          'data-attribute': `${id}#${attribute.name}`,
          style: inRect({ x: 0, y: i * metrics.fila, width: zone.width, height: metrics.fila }, `line-height:${num(metrics.fila)}px;${box}`),
        },
        children: [
          ...(effects?.below ?? []),
          ...(ofTheme === undefined
            ? [attributeText(attribute, marks)]
            : [
                { tag: 'span', attrs: { 'data-fila-texto': 'name', style: inline(ofTheme.textos.name, style, nodeMetrics.tamanoDeFila?.name) }, children: [attribute.name] } as MarkupElement,
                ': ',
                { tag: 'span', attrs: { 'data-fila-texto': 'type', style: inline(ofTheme.textos.type, style, nodeMetrics.tamanoDeFila?.type) }, children: [`${attribute.type}${attribute.optional === true ? '?' : ''}`] } as MarkupElement,
              ]),
          // ER View: one chip per key mark, against the right border of the row.
          ...keyChips(attribute, nodeMetrics).map((chip): MarkupElement => ({
            tag: 'span',
            attrs: {
              class: 'rd-clave',
              'data-key': chip.clave,
              style: `right:${num(chip.derecha)}px;width:${num(chip.width)}px;font-size:${num(chip.tamano)}px;line-height:${num(chip.tamano + 4)}px;top:${num((metrics.fila - chip.tamano - 4) / 2)}px;${ofTheme?.textos.key === undefined ? '' : `opacity:1;${inline(ofTheme.textos.key, style, chip.tamano)}`}`,
            },
            children: [chip.texto],
          })),
          ...(effects?.above ?? []),
        ],
      };
    }),
  };
}

/** Collapse control of a Group: the Style glyph according to the state. */
export function paintControl(style: Style, { node, box, onClick }: { node: ResolvedNode; box: NodeBox; onClick: () => void }): MarkupElement {
  const metrics = node.collapsed ? style.table.grupoColapsado : style.table.grupoAbierto;
  const height = Math.min(headerHeight(metrics), box.height);
  const rect = { x: box.width - 2 * metrics.margenDeControl, y: 0, width: 2 * metrics.margenDeControl, height };
  return {
    tag: 'div',
    attrs: { class: 'rd-control', 'data-toggle': node.id, style: inRect(rect, `line-height:${height}px;`) },
    onClick: onClick,
    children: [node.collapsed ? style.glyphs.collapsedGlyph : style.glyphs.expandedGlyph],
  };
}

/**
 * Edge: the Theme's stroke stack over the orthogonal path, its endpoint
 * markers and the cardinality of each endpoint next to its port, shifted
 * away from the Node. `origin` is the Palette color of the source Node (`ORIGIN`). The extra children
 * (the label) are set by the caller; `attributes` carries opacity and id.
 */
export function paintEdge(
  style: Style,
  data: {
    id: string;
    points: readonly Point[];
    origin?: string;
    from?: string;
    to?: string;
    er?: { identificante: boolean };
    /** The Theme's stroke stack of the state that rules the Edge (paint-only); without it, the rest stack. */
    inState?: { capas: EdgePaint['capas']; identificante?: EdgePaint['capas'] };
    attributes?: Record<string, string>;
    extra?: MarkupElement[];
    onClick?: () => void;
  },
): MarkupElement {
  const { id, points, origin, er, inState, attributes = {}, extra = [], onClick } = data;
  const { edge, metrics } = style;
  const atRest = (origin === undefined ? undefined : style.paint.arista.origenes[origin]) ?? style.paint.arista;
  const ofTheme = inState === undefined ? atRest : { ...atRest, capas: inState.capas, identificante: inState.identificante ?? atRest.identificante };
  // ER View: the cardinality markers replace the Theme's and the cardinality text.
  const paint = er === undefined ? ofTheme : erPaint(ofTheme, points, data.from, data.to, er.identificante);
  const [from, to] = er === undefined ? [data.from, data.to] : [undefined, undefined];
  const endpoints = [
    ['from', from, points[0]!, points[1]!],
    ['to', to, points[points.length - 1]!, points[points.length - 2]!],
  ] as const;
  const cardinalities: MarkupElement[] = [];
  for (const [side, text, endpoint, neighbor] of endpoints) {
    if (text === undefined) continue;
    // It moves away from the port along the segment (into the path) and goes up a little.
    const dx = Math.sign(neighbor.x - endpoint.x);
    const dy = Math.sign(neighbor.y - endpoint.y);
    cardinalities.push({
      tag: 'text',
      attrs: {
        'data-cardinality': `${id}:${side}`,
        x: num(endpoint.x + dx * edge.cardinalityGap),
        y: num(endpoint.y + dy * edge.cardinalityGap - (dy === 0 ? edge.cardinalityLift : 0)),
        'font-family': style.bodyFont,
        'font-size': num(metrics.fontSize * metrics.escalaCardinalidad),
        fill: style.text,
      },
      children: [text],
    });
  }
  return {
    tag: 'g',
    attrs: { 'data-edge': id, ...attributes },
    ...(onClick !== undefined && { onClick }),
    children: [
      ...paintStrokes(paint, points, style.paint.semilla),
      ...paintMarkers(style, paint, points),
      ...cardinalities,
      ...extra,
    ],
  };
}

/** Crow's foot marker of each canonical cardinality of an ER View. */
const ER_SHAPE: Readonly<Record<string, PrimitiveName>> = { '1': 'one', '0..1': 'zero-one', '1..*': 'many', '0..*': 'zero-many' };

/**
 * Paint of an ER View Edge: solid line if identifying and dashed otherwise; no arrows;
 * at each endpoint the marker of its cardinality (none if missing or not canonical). Color and size come from the Theme's
 * marker (`fin`, otherwise `origen`) or from the main stroke; the size is clamped to the available final run.
 */
function erPaint(base: EdgePaint, points: readonly Point[], from: string | undefined, to: string | undefined, identificante: boolean): EdgePaint {
  const layers = erEdgeLayers(base, identificante);
  const ofTheme = base.fin ?? base.origen;
  const color = ofTheme?.props['color'] ?? layers.at(-1)?.props['color'] ?? '';
  const fontSizeValue = Number(ofTheme?.props['size'] ?? ER_MARKER_LENGTH);
  const length = (a: Point | undefined, b: Point | undefined): number => (a === undefined || b === undefined ? fontSizeValue : Math.hypot(a.x - b.x, a.y - b.y));
  const marker = (cardinality: string | undefined, a: Point | undefined, b: Point | undefined): PaintedPrimitive | undefined => {
    const kind = cardinality === undefined ? undefined : ER_SHAPE[cardinality];
    return kind === undefined ? undefined : { tipo: kind, props: { color, size: Math.min(fontSizeValue, length(a, b)) } };
  };
  const [first, second, secondToLast, last] = [points[0], points[1], points[points.length - 2], points[points.length - 1]];
  const origin = marker(from, first, second);
  const end = marker(to, last, secondToLast);
  return { capas: layers, etiqueta: base.etiqueta, ...(origin !== undefined && { origen: origin }), ...(end !== undefined && { fin: end }) };
}

/** Point of a label without its own box: middle of the longest segment of the path, raised by `boxlessLabelLift`. Shared with the shell hit-test. */
export function boxlessLabelCenter(style: Style, points: readonly Point[]): Point {
  let middle = points[0] ?? { x: 0, y: 0 };
  let best = -1;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best) {
      best = length;
      middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - style.edge.boxlessLabelLift };
    }
  }
  return middle;
}

/**
 * Label of an Edge centered in the box ELK reserved for it; without a box (the
 * Edge was rerouted by a Pin) it goes over the midpoint of the longest segment
 * of the path. It carries a halo of the background color to read over the lines.
 */
export function paintEdgeLabel(
  drawStyle: Style,
  { id, text, points, box }: { id: string; text: string; points: readonly Point[]; box: NodeBox | undefined },
): MarkupElement {
  const { metrics, label } = drawStyle;
  const fontSizeValue = metrics.fontSize * metrics.escalaEtiqueta;
  const middle =
    box !== undefined
      ? { x: box.x + box.width / 2, y: box.y + box.height / 2 + fontSizeValue * label.verticalCentering }
      : boxlessLabelCenter(drawStyle, points);
  // Label box model: with `fill` or `border` the box ELK reserved (or the measured one) is drawn behind the text.
  const { fill, border, radius, color, weight, font, shadow, rotate, style } = drawStyle.paint.arista.etiqueta.props;
  const borderWidth = drawStyle.paint.arista.etiqueta.props['border-width'];
  const withBox = fill !== undefined || border !== undefined;
  const measure = labelSize(text, metrics);
  const rect = box ?? { x: middle.x - measure.width / 2, y: middle.y - fontSizeValue * label.verticalCentering - measure.height / 2, ...measure };
  const textSvg: MarkupElement = {
    tag: 'text',
    attrs: {
      'data-edge-label': id,
      x: num(middle.x),
      y: num(middle.y),
      'text-anchor': 'middle',
      'font-family': font === 'mono' ? drawStyle.monoFont : drawStyle.bodyFont,
      'font-size': num(fontSizeValue),
      fill: color === undefined ? drawStyle.text : String(color),
      ...(weight !== undefined && { 'font-weight': num(Number(weight)) }),
      ...(style === 'italic' && { 'font-style': 'italic' }),
      ...(!withBox && { stroke: label.halo.color, 'stroke-width': num(label.halo.width), 'paint-order': 'stroke' }),
    },
    children: [text],
  };
  if (!withBox) return textSvg;
  // Like CSS `border-radius`: the radius does not exceed half of the short side, so a pill is never an ellipse.
  const r = num(Math.min(Number(radius), rect.width / 2, rect.height / 2));
  const shape = { x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: r, ry: r };
  const shadowValue: MarkupElement[] =
    shadow === undefined ? [] : [{ tag: 'rect', attrs: { ...shape, x: num(rect.x + LABEL_SHADOW), y: num(rect.y + LABEL_SHADOW), fill: String(shadow) } }];
  const boxSvg: MarkupElement = {
    tag: 'rect',
    attrs: {
      'data-edge-label-box': id,
      ...shape,
      fill: fill === undefined ? 'none' : String(fill),
      ...(border !== undefined && { stroke: String(border) }),
      ...(border !== undefined && borderWidth !== undefined && { 'stroke-width': num(Number(borderWidth)) }),
    },
  };
  const tiltDeg: Record<string, string> = rotate === undefined || Number(rotate) === 0 ? {} : { transform: `rotate(${num(Number(rotate))} ${num(rect.x + rect.width / 2)} ${num(rect.y + rect.height / 2)})` };
  return { tag: 'g', attrs: tiltDeg, children: [...shadowValue, boxSvg, textSvg] };
}

/** Offset (px) of the hard shadow of an Edge label. */
const LABEL_SHADOW = 2;

/** State outline around a box (Node, Group) or an Attribute row (`rect`, relative to the Node box). Its look comes from the style sheet. */
export function paintBoxState(state: VisualState, id: string, rect?: Rect): MarkupElement {
  return {
    tag: 'div',
    attrs: {
      class: 'rd-estado',
      'data-state': state,
      ...(state === 'selected' && { 'data-selected': id }),
      ...(rect !== undefined && { style: inRect(rect) }),
    },
  };
}

/** State outline over the path of an Edge (SVG). */
export function paintPathState(style: Style, state: VisualState, id: string, points: readonly Point[]): MarkupElement {
  const { color, width, stroke, opacity } = stateLook(style, state);
  // The outline follows the path of the main stroke (the last of the stack): same corners as the Edge.
  const main = style.paint.arista.capas.at(-1);
  const path = main === undefined ? points.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ') : layerPath(main, points);
  return {
    tag: 'path',
    attrs: {
      d: path,
      'data-state': state,
      ...(state === 'selected' && { 'data-selected': id }),
      fill: 'none',
      stroke: color,
      'stroke-width': num(width),
      ...(stroke !== undefined && { 'stroke-dasharray': stroke }),
      ...(opacity !== 1 && { opacity: num(opacity) }),
      'pointer-events': 'none',
    },
  };
}
