/** Derivation of the sequence and ER Theme elements the Theme does not declare, from the resolved paint of `node` and `edge`. */
import { MESSAGE_KINDS } from 'canonical';
import type { MessageKind } from 'canonical';

import { primitivesOfFamily } from './catalog';
import type { PrimitiveName } from './catalog';
import type {
  PaintedLayer,
  ActivationPaint,
  EdgePaint,
  SequenceBoxPaint,
  ElementPaint,
  RowPaint,
  FragmentPaint,
  NotePaint,
  SequenceStrokePaint,
  Paint,
  PaintedPrimitive,
  VariantStroke,
} from './style';

/** They clip the content of an ER table or a frame: derived as `rect` with `TABLE_RADIUS`. */
const PILL_SHAPES: readonly PrimitiveName[] = ['pill', 'circle'];
export const isPill = (kind: string): boolean => PILL_SHAPES.some((shape) => shape === kind);
export const TABLE_RADIUS = 8;

/** px; when the Edge declares no marker. */
const MARKER_LENGTH = 10;
/** Percentage of the fill color kept in the Fragment, so the Messages are not hidden. */
const FRAGMENT_TINT = 14;
const PAPER_OPACITY = 0.2;
const NOTE_COLOR = 'amber';
/** Fallback for a marker with neither a color nor a stroke to take it from. */
const BLACK = '#000000';

const MESSAGE_MARKER: Record<MessageKind, PrimitiveName> = { sync: 'arrow', async: 'chevron', reply: 'chevron', create: 'chevron', destroy: 'arrow' };

const BOX_FAMILIES: readonly string[] = [...primitivesOfFamily('forma'), ...primitivesOfFamily('relleno'), ...primitivesOfFamily('borde')];
const FILL_FAMILIES: readonly string[] = primitivesOfFamily('relleno');

const primitive = (kind: PrimitiveName, props: Record<string, number | string>): PaintedPrimitive => ({ tipo: kind, props });
const strokeColor = (layers: readonly PaintedLayer[]): number | string => layers.at(-1)?.props['color'] ?? BLACK;

/** Only shape, fill and border. */
export const boxLayers = (layers: readonly PaintedLayer[]): PaintedLayer[] => layers.filter((layer) => BOX_FAMILIES.includes(layer.tipo));

// ---- Strokes: lifeline and message ----

/** `cross` with the stroke color and the length of the Edge marker. */
const lifelineEnd = (edge: EdgePaint, layers: readonly PaintedLayer[]): PaintedPrimitive =>
  primitive('cross', { size: Number(edge.fin?.props['size'] ?? MARKER_LENGTH), color: strokeColor(layers) });

/** The declared one (with `cross` if it declares no `end`) or the one derived from `edge`, dashed and without markers. */
export function lifeline(declared: SequenceStrokePaint | undefined, edge: EdgePaint): SequenceStrokePaint {
  if (declared !== undefined) return declared.fin === undefined ? { ...declared, fin: lifelineEnd(edge, declared.capas) } : declared;
  const layers = edge.capas.map((layer) => ({ ...layer, props: { ...layer.props, style: 'dashed' } }));
  return { capas: layers, fin: lifelineEnd(edge, layers), variantes: {}, tipos: {} };
}

const strokeStyle = (layers: readonly PaintedLayer[]): string => String(layers.at(-1)?.props['style'] ?? 'solid');

/** Opposite dash style in `reply` and `create`, and the marker of the kind, without a start marker. */
function derivedMessage(baseLayers: readonly PaintedLayer[], baseEnd: PaintedPrimitive | undefined, kind: MessageKind): VariantStroke {
  const continuous = strokeStyle(baseLayers) === 'solid';
  const style = kind === 'reply' || kind === 'create' ? (continuous ? 'dashed' : 'solid') : undefined;
  const layers = style === undefined ? [...baseLayers] : baseLayers.map((layer) => ({ ...layer, props: { ...layer.props, style } }));
  return { capas: layers, fin: primitive(MESSAGE_MARKER[kind], { size: Number(baseEnd?.props['size'] ?? MARKER_LENGTH), color: baseEnd?.props['color'] ?? strokeColor(layers) }) };
}

/** Per Message kind, the `kind` patch or the derivation; without a `message` block it starts from the Edge, with the block, from its stroke and `end`. */
export function message(declared: SequenceStrokePaint | undefined, edge: EdgePaint): SequenceStrokePaint {
  const kindOf = (kind: MessageKind): VariantStroke => {
    if (declared === undefined) return derivedMessage(edge.capas, edge.fin, kind);
    const patch = declared.variantes[kind];
    if (patch !== undefined) {
      const end = patch.fin ?? declared.fin;
      const origin = patch.origen ?? declared.origen;
      return { capas: patch.capas, ...(origin !== undefined && { origen: origin }), ...(end !== undefined && { fin: end }) };
    }
    const derived = derivedMessage(declared.capas, undefined, kind);
    return declared.fin === undefined ? derived : { ...derived, fin: declared.fin };
  };
  // Declared states: the `message` block's, or (without the block) the Edge's, derived per kind like the base stack.
  const stateOf = (kind: MessageKind): VariantStroke['estados'] => {
    if (declared !== undefined) {
      const own = Object.entries(declared.estadosDeTrazo ?? {});
      return own.length === 0 ? undefined : Object.fromEntries(own.map(([state, e]) => [state, declared.variantes[kind] !== undefined ? (e.variantes[kind] ?? e.capas) : derivedMessage(e.capas, undefined, kind).capas]));
    }
    const fromEdge = Object.entries(edge.estadosDeArista ?? {});
    return fromEdge.length === 0 ? undefined : Object.fromEntries(fromEdge.map(([state, e]) => [state, derivedMessage(e.capas, edge.fin, kind).capas]));
  };
  const kinds = Object.fromEntries(
    MESSAGE_KINDS.map((kind) => {
      const states = stateOf(kind);
      return [kind, { ...kindOf(kind), ...(states !== undefined && { estados: states }) }];
    }),
  );
  if (declared !== undefined) return { ...declared, tipos: kinds };
  return { capas: edge.capas, ...(edge.origen !== undefined && { origen: edge.origen }), ...(edge.fin !== undefined && { fin: edge.fin }), variantes: {}, tipos: kinds };
}

// ---- Boxes: activation, fragment, note ----

const emptyBox = (layers: PaintedLayer[]): SequenceBoxPaint & { derivado: true } => ({ capas: layers, textos: {}, variantes: {}, estados: {}, derivado: true });

/** Reduced to shape, fill and border, without states, texts or animation. */
function boxElement(element: ElementPaint): ElementPaint {
  return { capas: boxLayers(element.capas), textos: {}, estados: {}, tipos: Object.fromEntries(Object.entries(element.tipos).map(([kind, stack]) => [kind, { capas: boxLayers(stack.capas), textos: {}, estados: {} }])) };
}

export function derivedActivation(paint: Pick<Paint, 'nodo' | 'grupo'>): ActivationPaint {
  const byNode = { nodo: boxElement(paint.nodo), grupo: { abierto: boxElement(paint.grupo.abierto), colapsado: boxElement(paint.grupo.colapsado) } };
  return { ...emptyBox(byNode.nodo.capas), porNodo: byNode };
}

function derivedFragmentLayers(nodeLayers: readonly PaintedLayer[]): PaintedLayer[] {
  const layers = boxLayers(nodeLayers);
  const fillColor = layers.filter((layer) => FILL_FAMILIES.includes(layer.tipo)).map((layer) => layer.props['color'] ?? layer.props['from']).filter((c) => c !== undefined).at(-1);
  const output: PaintedLayer[] = [];
  let placedTint = false;
  for (const layer of layers) {
    if (FILL_FAMILIES.includes(layer.tipo)) {
      if (placedTint || fillColor === undefined) continue;
      placedTint = true;
      output.push({ ...layer, ...primitive('solid', { color: `color-mix(in srgb,${String(fillColor)} ${FRAGMENT_TINT}%,transparent)` }) });
    } else if (isPill(layer.tipo)) {
      output.push({ ...layer, ...primitive('rect', { radius: TABLE_RADIUS }) });
    } else output.push(layer);
  }
  return output;
}

/** The declared one or the one derived from the Node without a Node kind. Guards: `guard` or the Edge stroke color; without `divider`, dashed in the border color. */
export function fragment(declared: SequenceBoxPaint | undefined, node: readonly PaintedLayer[], edge: EdgePaint, border: string): FragmentPaint {
  const base = declared ?? emptyBox(derivedFragmentLayers(node));
  const declaredDivider = base.textos['divider'];
  const divider = declaredDivider === undefined ? primitive('line', { width: 1, style: 'dashed', color: border }) : { ...declaredDivider, props: { ...declaredDivider.props, color: declaredDivider.props['color'] ?? border } };
  return { ...base, textos: { ...base.textos, divider }, colorDeGuarda: String(base.textos['guard']?.props['color'] ?? edge.capas.at(-1)?.props['color'] ?? border) };
}

/** The declared one or the derived one: soft tint and thin stroke in the Palette note color (`amber`, otherwise the border). */
export function note(declared: SequenceBoxPaint | undefined, palette: Readonly<Record<string, string>>, border: string): NotePaint {
  const color = palette[NOTE_COLOR] ?? border;
  if (declared !== undefined) return { ...declared, papel: { color, opacidadDeRelleno: 1 } };
  return { ...emptyBox([{ nombre: 'fill', ...primitive('solid', { color }) }, { nombre: 'border', ...primitive('border', { color, width: 1 }) }]), papel: { color, opacidadDeRelleno: PAPER_OPACITY } };
}

/** Rows without Layers whose text is that of the `attrs` Slot. */
export const derivedRow = (): RowPaint => ({ base: [], variantes: {}, estados: {}, textos: {}, derivado: true });
