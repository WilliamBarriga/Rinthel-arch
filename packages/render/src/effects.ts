/**
 * Painters of the effect Families. `EFFECT_PAINTERS` gives the sheet declarations shared by every element
 * (shadow, glow, glass, ring; `{}` for the rest); `elementEffects`, what depends on the element (freehand, tilt,
 * tape...) seeded with its id and Layer name, never with the size or the render order. Everything only paints: it may
 * stick out of the box without touching the Metrics.
 */
import { fnv1a, layerSpin, layerSeed } from 'theme';
import type { PaintedLayer, PrimitiveName, NodePaint } from 'theme';

import { cleanCssValue, num } from './element';
import { borderWidth } from './paint/common';
import type { MarkupElement } from './element';
import type { Style } from './style';

type Declarations = Record<string, string>;
type Props = PaintedLayer['props'];

const px = (value: number | string | undefined): string => `${num(Number(value))}px`;
const css = (value: number | string | undefined): string => cleanCssValue(String(value));

/** What the per-element effects add to the box of a Node or Group. */
export interface ElementEffects {
  /** Tilt of the positioned box, in degrees (0 without tilt): goes after its translation, around its center. */
  tiltDeg: number;
  /** Inline style of the painted container (the freehand filter). */
  node: string;
  /** Children before the content (SVG filters, tapes under the content). */
  below: MarkupElement[];
  /** Children after the content (tapes with `over`). */
  above: MarkupElement[];
}

interface EffectContext {
  style: Style;
  layers: NodePaint['capas'];
  /** Layer seed: element id + Layer name (+ the Theme's `seed N`). */
  seedValue: number;
}

/** An effect is a sheet effect (CSS declarations valid for every element) or a per-element one (its own children, tilt or filter). */
type Effect =
  | { readonly sheet: (props: Props) => Declarations }
  | {
      readonly element: (layer: PaintedLayer, context: EffectContext, result: ElementEffects) => void;
      /** Sheet rule for the children it paints (if any): selector (with `&` for the scope class) and declarations. */
      readonly rule?: [string, Declarations];
    };

const beside = (layer: PaintedLayer, result: ElementEffects, child: MarkupElement): void => {
  (layer.encima === true ? result.above : result.below).push(child);
};

/** Effects table: `EFFECT_PAINTERS`, `elementEffects` and `EFFECT_RULES` come from it. */
const EFFECTS = {
  // Several shadows stack (see `boxDeclarations`); blur 0 gives the hard shadow.
  shadow: { sheet: ({ x, y, blur, spread, inset, color }) => ({ 'box-shadow': `${Number(inset) === 1 ? 'inset ' : ''}${px(x)} ${px(y)} ${px(blur)} ${px(spread)} ${css(color)}` }) },
  glow: { sheet: ({ radius, spread, color }) => ({ 'box-shadow': `0px 0px ${px(radius)} ${px(spread)} ${css(color)}` }) },
  glass: { sheet: ({ blur, saturate }) => ({ 'backdrop-filter': `blur(${px(blur)}) saturate(${num(Number(saturate))}%)` }) },
  ring: { sheet: ({ color, width, offset }) => ({ outline: `${px(width)} solid ${css(color)}`, 'outline-offset': px(offset) }) },
  tape: {
    element: (layer, { seedValue }, result) => beside(layer, result, ribbon(layer.props, seedValue)),
    rule: ['& .rd-cinta', { position: 'absolute', 'pointer-events': 'none' }],
  },
  stripe: {
    element: (layer, { layers }, result) => beside(layer, result, band(layer.props, borderWidth(layers))),
    rule: ['& .rd-franja', { position: 'absolute', 'pointer-events': 'none', 'border-radius': 'inherit' }],
  },
  pins: {
    element: (layer, _context, result) => beside(layer, result, pinList(layer.props)),
    rule: ['& .rd-pines', { position: 'absolute', 'pointer-events': 'none', 'background-repeat': 'no-repeat' }],
  },
  fold: {
    element: ({ props }, { style, layers }, result) => {
      result.above.push(foldSize(props, style.background, borderWidth(layers)));
    },
    rule: ['& .rd-doblez', { position: 'absolute', width: '0', height: '0', 'border-style': 'solid', 'pointer-events': 'none' }],
  },
  sketch: {
    element: ({ props }, { seedValue }, result) => {
      const filterId = `rd-sk-${fnv1a(`${seedValue}|${props['roughness']}|${props['frequency']}`).toString(36)}`;
      result.node += `filter:url(#${filterId});`;
      result.below.push(freehandFilter(filterId, seedValue, Number(props['roughness']), Number(props['frequency'])));
    },
    rule: ['& .rd-defs', { position: 'absolute', 'pointer-events': 'none' }],
  },
  tilt: {
    element: ({ props }, { seedValue }, result) => {
      result.tiltDeg += layerSpin(seedValue, Number(props['degrees']));
    },
  },
} as const satisfies Partial<Record<PrimitiveName, Effect>>;

type EffectName = keyof typeof EFFECTS;

const UNPAINTED = (): Declarations => ({});

/** Sheet painter of each effect; the ones painted per element contribute no declarations here. */
export const EFFECT_PAINTERS: { readonly [P in EffectName]: (props: Props) => Declarations } = Object.fromEntries(
  Object.entries(EFFECTS as Record<string, Effect>).map(([name, effect]) => [name, 'sheet' in effect ? effect.sheet : UNPAINTED]),
) as { [P in EffectName]: (props: Props) => Declarations };

/** Sheet rules for the children painted by the per-element effects, in table order. */
export const EFFECT_RULES: ReadonlyArray<[string, Declarations]> = (Object.values(EFFECTS) as Effect[]).flatMap((effect) => ('rule' in effect && effect.rule !== undefined ? [effect.rule] : []));

const NO_EFFECTS: ElementEffects = { tiltDeg: 0, node: '', below: [], above: [] };

const isPerElement = (kind: string): boolean => kind in EFFECTS && 'element' in (EFFECTS as Record<string, Effect>)[kind]!;

/** Effects that depend on the element: seed = element id + Layer name (+ the Theme's `seed N`). */
export function elementEffects(style: Style, { capas: layers }: Pick<NodePaint, 'capas'>, id: string): ElementEffects {
  if (!layers.some((c) => isPerElement(c.tipo))) return NO_EFFECTS;
  const result: ElementEffects = { tiltDeg: 0, node: '', below: [], above: [] };
  for (const layer of layers) {
    const effect = (EFFECTS as Record<string, Effect>)[layer.tipo];
    if (effect !== undefined && 'element' in effect) effect.element(layer, { style, layers, seedValue: layerSeed(id, layer.nombre, style.paint.semilla) }, result);
  }
  return result;
}

/** Hidden SVG filter: seeded fractal noise that displaces the outline. Region relative to the box: it does not depend on its size. */
function freehandFilter(filterId: string, seedValue: number, roughnessValue: number, freq: number): MarkupElement {
  return {
    tag: 'svg',
    attrs: { class: 'rd-defs', width: '0', height: '0', 'aria-hidden': 'true' },
    children: [
      {
        tag: 'filter',
        attrs: { id: filterId, x: '-10%', y: '-10%', width: '120%', height: '120%' },
        children: [
          { tag: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: num(freq), numOctaves: '2', seed: String(seedValue % 1_000_000), result: 'ruido' } },
          { tag: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: 'ruido', scale: num(roughnessValue), xChannelSelector: 'R', yChannelSelector: 'G' } },
        ],
      },
    ],
  };
}

/** Folded corner at the top right: two triangles (page background outside, `color` inside) over the border. */
function foldSize(props: Props, background: string, border: number): MarkupElement {
  const side = px(props['size']);
  const shadowValue = props['shadow'] === undefined ? '' : `box-shadow:-2px 2px 0 ${css(props['shadow'])};`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-doblez',
      style: `top:${px(-border)};right:${px(-border)};border-width:0 ${side} ${side} 0;border-color:transparent ${css(background)} ${css(props['color'])} transparent;${shadowValue}`,
    },
  };
}

/** Direction of the gradient that paints the band from its side. */
const TOWARD: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** Band on one side: an element that covers the box from its outer outline, with the box radius, and a sharp cut gradient. */
function band(props: Props, border: number): MarkupElement {
  const width = px(props['width']);
  const covers = `calc(100% + ${px(2 * border)})`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-franja',
      style: `left:${px(-border)};top:${px(-border)};width:${covers};height:${covers};background:linear-gradient(to ${TOWARD[String(props['side'])] ?? 'right'},${css(props['color'])} ${width},transparent ${width});`,
    },
  };
}

/** Two combs, top and bottom, outside the box: a single element with the same pattern on its two bands. */
function pinList(props: Props): MarkupElement {
  const length = px(props['length']);
  const width = px(props['width']);
  const comb = `repeating-linear-gradient(90deg,${css(props['color'])} 0 ${width},transparent ${width} ${px(props['step'])})`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-pines',
      style: `left:${px(props['margin'])};right:${px(props['margin'])};top:-${length};bottom:-${length};background-image:${comb},${comb};background-size:100% ${length},100% ${length};background-position:0 0,0 100%;`,
    },
  };
}

/** Adhesive tape centered on the top border: fixed `angle` or, without it, tilted up to 3 degrees with its Layer's PRNG. */
function ribbon(props: Props, seedValue: number): MarkupElement {
  const height = Number(props['height']);
  const tiltDeg = num(props['angle'] === undefined ? layerSpin(seedValue, 3) : Number(props['angle']));
  return {
    tag: 'div',
    attrs: {
      class: 'rd-cinta',
      style: `left:50%;top:${num(-height / 2)}px;width:${num(Number(props['width']))}px;height:${num(height)}px;background:${css(props['color'])};transform:translateX(-50%) rotate(${tiltDeg}deg);`,
    },
  };
}
