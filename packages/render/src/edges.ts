/**
 * Edge painters (ADR 0008): the stroke stack and the endpoint
 * markers, reading only from the paint of the resolved Style. They are pure SVG and
 * only paint: neither strokes nor markers enter the Metrics (of the
 * Edge only the label box counts). Each marker is an explicit shape
 * rotated toward the path, with no `<marker>` nor ids to share.
 */
import type { PrimitiveNameAt, PaintedPrimitive, VariantStroke } from 'theme';

import { fingerprint, num } from './element';
import type { MarkupElement } from './element';
import type { Style } from './style';

type Point = { x: number; y: number };
type Props = PaintedPrimitive['props'];

/** `stroke-dasharray` and caps of each stroke style, according to its width `w`. */
const STYLES: Record<string, (w: number) => Record<string, string>> = {
  solid: () => ({}),
  dashed: (w) => ({ 'stroke-dasharray': `${num(4 * w)} ${num(2 * w)}` }),
  dotted: (w) => ({ 'stroke-dasharray': `0 ${num(2 * w)}`, 'stroke-linecap': 'round' }),
  pixel: (w) => ({ 'stroke-dasharray': `${num(w)} ${num(w)}`, 'shape-rendering': 'crispEdges' }),
};

const unitValue = (a: Point, b: Point): Point => {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};

export type Corner = 'sharp' | 'chamfer' | 'round';

/**
 * `M ... L ...` path; with `chamfer` each corner is cut at `measure` and with `round`
 * it is curved with a `Q` of radius `measure` (both limited to half of the shortest segment).
 */
export function strokePath(points: readonly Point[], corner: Corner, measure: number): string {
  const order: Array<Point & { curve?: Point }> = [];
  points.forEach((p, i) => {
    const a = points[i - 1];
    const c = points[i + 1];
    if (corner === 'sharp' || a === undefined || c === undefined) {
      order.push(p);
      return;
    }
    const k = Math.min(measure, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(c.x - p.x, c.y - p.y) / 2);
    const enters = unitValue(a, p);
    const exits = unitValue(p, c);
    order.push({ x: p.x - enters.x * k, y: p.y - enters.y * k }, { x: p.x + exits.x * k, y: p.y + exits.y * k, ...(corner === 'round' && { curve: p }) });
  });
  return order.map(({ x, y, curve }, i) => (curve !== undefined ? `Q ${num(curve.x)} ${num(curve.y)} ` : i === 0 ? 'M ' : 'L ') + `${num(x)} ${num(y)}`).join(' ');
}

/** Freehand noise frequency when the stroke does not give one (the one of the Nodes' `sketch` filter). */
const DEFAULT_FREQUENCY = 0.03;

/** Freehand stroke of a Layer: its displacement (`roughness`, 0 if it has none) and the noise frequency. */
const freehand = (props: Props): { roughnessValue: number; freq: number } => ({ roughnessValue: Number(props['roughness'] ?? 0), freq: Number(props['frequency'] ?? DEFAULT_FREQUENCY) });

/** Id of a stroke's freehand filter: the same for the same properties and seed. */
const filterId = (props: Props, seedValue: number): string => {
  const { roughnessValue, freq } = freehand(props);
  return `rd-skl-${fingerprint(`${roughnessValue}|${freq}|${seedValue}`)}`;
};

/** SVG path (`d`) of a stroke over `points`, with the corner and measure its Layer declares. */
export function layerPath(layer: { props: Props }, points: readonly Point[]): string {
  const { corner, cut, radius } = layer.props as Props & { corner: Corner };
  return strokePath(points, corner, Number(corner === 'round' ? radius : cut));
}

/** The stroke stack, bottom to top: a wide translucent stroke under the main one is the glow. */
export function paintStrokes(paint: VariantStroke, points: readonly Point[], seedValue = 0): MarkupElement[] {
  return paint.capas.map((layer) => {
    const { color, width, style } = layer.props as Props & { style: string };
    const thickness = Number(width);
    return {
      tag: 'path',
      attrs: {
        d: layerPath(layer, points),
        fill: 'none',
        stroke: String(color),
        'stroke-width': num(thickness),
        'data-capa': layer.nombre,
        ...(STYLES[style]?.(thickness) ?? {}),
        ...(layer.props['cap'] !== undefined && { 'stroke-linecap': String(layer.props['cap']) }),
        ...(freehand(layer.props).roughnessValue > 0 && { filter: `url(#${filterId(layer.props, seedValue)})` }),
      },
    };
  });
}

/**
 * Freehand filters of the Style's strokes, one per combination of properties, for the Edge
 * canvas (`width` x `height`). Region in canvas coordinates: with the stroke box a straight run (height 0) would vanish.
 */
export function strokeFilters(style: Style, width: number, height: number): MarkupElement[] {
  const seedValue = style.paint.semilla ?? 0;
  const paints = [style.paint.arista, ...Object.values(style.paint.arista.origenes)];
  const filters = new Map<string, MarkupElement>();
  for (const layer of paints.flatMap((p) => p.capas)) {
    const { roughnessValue, freq } = freehand(layer.props);
    const id = filterId(layer.props, seedValue);
    if (roughnessValue <= 0 || filters.has(id)) continue;
    filters.set(id, {
      tag: 'filter',
      attrs: { id, filterUnits: 'userSpaceOnUse', x: num(-FILTER_MARGIN), y: num(-FILTER_MARGIN), width: num(width + 2 * FILTER_MARGIN), height: num(height + 2 * FILTER_MARGIN) },
      children: [
        { tag: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: String(Math.round(freq * 1000) / 1000), numOctaves: '2', seed: String(seedValue % 1_000_000), result: 'ruido' } },
        { tag: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: 'ruido', scale: num(roughnessValue), xChannelSelector: 'R', yChannelSelector: 'G' } },
      ],
    });
  }
  return filters.size === 0 ? [] : [{ tag: 'defs', attrs: {}, children: [...filters.values()] }];
}

/** How much a stroke filter region sticks out of the canvas, so the displacement does not clip the borders. */
const FILTER_MARGIN = 40;

type Drawing = (side: number, color: string, background: string) => MarkupElement[];

/** Bar perpendicular to the path at `x` from the table border, `halfHeight` to each side. */
const bar = (x: number, halfHeight: number, color: string): MarkupElement => ({ tag: 'path', attrs: { d: `M ${num(-x)} ${num(-halfHeight)} L ${num(-x)} ${num(halfHeight)}`, stroke: color, 'stroke-width': '1.5', fill: 'none' } });
/** Crow's foot: three prongs from a point of the path at `length` from the border to the table border. */
const foot = (length: number, halfHeight: number, color: string): MarkupElement => ({ tag: 'path', attrs: { d: `M ${num(-length)} 0 L 0 ${num(-halfHeight)} M ${num(-length)} 0 L 0 0 M ${num(-length)} 0 L 0 ${num(halfHeight)}`, stroke: color, 'stroke-width': '1.5', fill: 'none' } });
/** "Zero" ring: hollow circle (filled with the background) centered at `x` from the border. */
const ring = (x: number, radius: number, color: string, background: string): MarkupElement => ({ tag: 'circle', attrs: { cx: num(-x), cy: '0', r: num(radius), fill: background, stroke: color, 'stroke-width': '1.5' } });

/** Shape of each marker in its local frame: the tip at the origin, facing +x (out of the path). Exhaustive table over the catalog. */
const MARKERS: { readonly [M in PrimitiveNameAt<'marcador'>]: Drawing } = {
  arrow: (s, color) => [{ tag: 'path', attrs: { d: `M 0 0 L ${num(-s)} ${num(-s / 2)} L ${num(-s)} ${num(s / 2)} z`, fill: color } }],
  dot: (s, color) => [{ tag: 'circle', attrs: { cx: num(-s / 2), cy: '0', r: num(s / 2), fill: color } }],
  square: (s, color) => [{ tag: 'rect', attrs: { x: num(-s), y: num(-s / 2), width: num(s), height: num(s), fill: color } }],
  diamond: (s, color) => [{ tag: 'path', attrs: { d: `M 0 0 L ${num(-s / 2)} ${num(-s / 2)} L ${num(-s)} 0 L ${num(-s / 2)} ${num(s / 2)} z`, fill: color } }],
  bar: (s, color) => [{ tag: 'path', attrs: { d: `M 0 ${num(-s / 2)} L 0 ${num(s / 2)}`, stroke: color, 'stroke-width': num(Math.max(2, s / 4)), fill: 'none' } }],
  hollow: (s, color, background) => [{ tag: 'circle', attrs: { cx: num(-s / 2), cy: '0', r: num(s / 2), fill: background, stroke: color, 'stroke-width': '1' } }],
  chevron: (s, color) => [
    {
      tag: 'path',
      attrs: { d: `M ${num(-0.65 * s)} ${num(-0.35 * s)} L 0 0 L ${num(-0.65 * s)} ${num(0.35 * s)}`, fill: 'none', stroke: color, 'stroke-width': num(Math.max(1, s / 7)), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    },
  ],
  // ER cardinality crow's feet (see `ER_SHAPE` in `painters.ts`). The local origin is the table border; the path lies toward -x and the marker takes `s`.
  one: (s, color) => [bar(0.4 * s, 0.45 * s, color), bar(0.7 * s, 0.45 * s, color)],
  'zero-one': (s, color, background) => [bar(0.4 * s, 0.45 * s, color), ring(0.78 * s, 0.2 * s, color, background)],
  many: (s, color) => [foot(0.62 * s, 0.45 * s, color), bar(0.85 * s, 0.45 * s, color)],
  'zero-many': (s, color, background) => [foot(0.55 * s, 0.45 * s, color), ring(0.55 * s + 0.2 * s + 0.04 * s, 0.2 * s, color, background)],
  // X centered on the endpoint (destroyed Lifeline): not a tip, it does not depend on where it faces.
  cross: (s, color) => [{ tag: 'path', attrs: { d: `M ${num(-s / 2)} ${num(-s / 2)} L ${num(s / 2)} ${num(s / 2)} M ${num(-s / 2)} ${num(s / 2)} L ${num(s / 2)} ${num(-s / 2)}`, stroke: color, 'stroke-width': num(Math.max(1.5, s / 6)), fill: 'none' } }],
  // One-way pad: centered on the endpoint (not behind the tip), a disc of the color with the background hole.
  via: (s, color, background) => [
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: num(s / 2), fill: color } },
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: num(s / 5), fill: background } },
  ],
};

/** ER cardinality markers: they carry `data-shape` so the DOM says which cardinality they draw. */
const ER_SHAPES: ReadonlySet<string> = new Set(['one', 'zero-one', 'many', 'zero-many']);

function marker(style: Style, primitive: PaintedPrimitive | undefined, endpoint: Point, neighbor: Point, side: 'origen' | 'fin'): MarkupElement[] {
  if (primitive === undefined) return [];
  const drawing = MARKERS[primitive.tipo as PrimitiveNameAt<'marcador'>];
  const angleDeg = (Math.atan2(endpoint.y - neighbor.y, endpoint.x - neighbor.x) * 180) / Math.PI;
  return [
    {
      tag: 'g',
      attrs: { 'data-marker': side, ...(ER_SHAPES.has(primitive.tipo) && { 'data-shape': primitive.tipo }), transform: `translate(${num(endpoint.x)} ${num(endpoint.y)}) rotate(${num(angleDeg)})` },
      children: drawing(Number(primitive.props['size']), String(primitive.props['color']), style.background),
    },
  ];
}

/** Source and end markers, rotated along the first and last segment of the path. */
export function paintMarkers(style: Style, paint: VariantStroke, points: readonly Point[]): MarkupElement[] {
  const [first, second] = [points[0], points[1]];
  const [last, secondToLast] = [points[points.length - 1], points[points.length - 2]];
  if (first === undefined || second === undefined || last === undefined || secondToLast === undefined) return [];
  return [...marker(style, paint.origen, first, second, 'origen'), ...marker(style, paint.fin, last, secondToLast, 'fin')];
}
