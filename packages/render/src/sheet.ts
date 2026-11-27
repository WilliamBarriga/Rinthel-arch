/**
 * Style sheet of the resolved Style: what paints Nodes and Groups (HTML) is
 * compiled to deterministic CSS, with the states as selectors. Pure: the same
 * Style gives the same text. Every rule goes under a scope class derived from the
 * content, so two `Diagram`s with different Themes on the same page do not clash.
 *
 * `PAINTERS` is the exhaustive Primitive -> painter table: adding a Primitive to the
 * `theme` catalog without a painter here breaks the typecheck.
 */
import { STATES, TITLE_DOT_EM } from 'theme';
import type { PaintedLayer, PrimitiveNameAt, NodePaint, PaintedPrimitive } from 'theme';

import { sheetAnimation, namesApart } from './animation';
import { EFFECT_PAINTERS, EFFECT_RULES } from './effects';
import { inlineStyle, fingerprint, num } from './element';
import { stateLook } from './style';
import type { VisualState, Style } from './style';
import { BORDER_PAINTERS } from './paint/border';
import { STACKABLE_BACKGROUNDS, css, isZoneLayer, px } from './paint/common';
import type { Declarations, Painter } from './paint/common';
import { ELEMENTS, elementStacks, elementPaint } from './stacks';
import { SHAPE_PAINTERS } from './paint/shape';
import { pageDeclarations } from './paint/page';
import { FILL_PAINTERS } from './paint/fill';

export type { Declarations, Painter };

/** One painter per catalog Primitive. The Layer color is the one the Theme says; `COLOR` already arrives as the Node's `--trazo` variable (its kind color). */
export const PAINTERS: { readonly [P in PrimitiveNameAt<'capa-nodo'>]: Painter } = {
  rect: ({ radius }) => ({ 'border-radius': px(radius) }),
  border: ({ color, width }) => ({ border: `${px(width)} solid ${css(color)}` }),
  ...SHAPE_PAINTERS,
  ...FILL_PAINTERS,
  ...BORDER_PAINTERS,
  ...EFFECT_PAINTERS,
  // The `code` Layer paints no CSS: its component draws it (see `code.ts`).
  code: () => ({}),
};

/** Shadows (box-shadow): they stack comma separated and the last Layer stays on top (it goes first in CSS). */
const SHADOWS = 'box-shadow';

/**
 * Declarations of an element's box with the `layers` Layers (its stack's at rest or in a state), bottom
 * to top. The `stack`'s own-element Layers are left out; a stack without Layers at rest is the Style's default
 * look.
 */
export function boxDeclarations(style: Style, stack: Pick<NodePaint, 'capas' | 'estados'>, layers: readonly PaintedLayer[] = stack.capas, ofZone = false): Declarations {
  const apart = namesApart(stack);
  // A Layer with `zone` header or body does not cover the box: its own element paints it (`paintZones`).
  const merged = layers.filter((layer) => !apart.has(layer.nombre) && (ofZone || !isZoneLayer(layer)));
  if (merged.length === 0 && stack.capas.length === 0) {
    return {
      'border-radius': px(style.node.radius),
      background: css(style.node.fill),
      border: `1px solid var(--trazo, ${css(style.border)})`,
    };
  }
  const declarations: Declarations = {};
  const accumulated: Record<string, string[]> = {};
  const shadows: string[] = [];
  for (const layer of merged) {
    for (const [property, value] of Object.entries(PAINTERS[layer.tipo as PrimitiveNameAt<'capa-nodo'>](layer.props))) {
      if (property === SHADOWS) shadows.unshift(value);
      // In CSS the first image is on top: the topmost Layer goes first (as on the page).
      else if ((STACKABLE_BACKGROUNDS as readonly string[]).includes(property)) (accumulated[property] ??= []).unshift(value);
      else declarations[property] = value;
    }
  }
  // Last and in a fixed order: the solid fill (`background`, which resets the images) cannot override the patterns.
  for (const property of STACKABLE_BACKGROUNDS) if (accumulated[property] !== undefined) declarations[property] = accumulated[property].join(',');
  if (shadows.length > 0) declarations[SHADOWS] = shadows.join(', ');
  return declarations;
}

/**
 * What changes when going from `from` to `to`: the different values and, for what is gone, its initial value. If the
 * `background` changes (which resets the background images) the images of `to` are repeated, so the change does not erase them.
 */
function difference(de: Declarations, a: Declarations): Declarations {
  const changes: Declarations = {};
  for (const [property, value] of Object.entries(a)) if (de[property] !== value) changes[property] = value;
  for (const property of Object.keys(de)) if (!(property in a)) changes[property] = 'initial';
  if ('background' in changes) for (const property of STACKABLE_BACKGROUNDS) if (property in a) changes[property] = a[property]!;
  return changes;
}

const block = inlineStyle;

/** Gap (px) between the box and the `planned` outline, which surrounds it from outside. */
const PLANNED_SLACK = 4;

function stateDeclarations(style: Style, state: VisualState): Declarations {
  const { color, width, stroke, opacity } = stateLook(style, state);
  const border = `${px(width)} ${stroke === undefined ? 'solid' : 'dashed'} ${css(color)}`;
  // `planned`: the opacity is the whole element's (`data-planeado`); the outline goes outside so it does not cover the Theme's border.
  if (state === 'planned') {
    const outside = px(-PLANNED_SLACK);
    const grows = `calc(100% + ${px(2 * PLANNED_SLACK)})`;
    return { border, left: outside, top: outside, width: grows, height: grows };
  }
  return { border, ...(opacity !== 1 && { opacity: num(opacity) }) };
}

/**
 * Variable with the box border width (px): absolute children (Slots, icons, zones) are placed from the inner
 * border, so they shift by that distance to land on the rectangle `layout` reserved.
 */
export const BORDER_VARIABLE = '--rd-borde';
const borderWidth = (declarations: Declarations): number => {
  const width = /(?:^|\s)(\d+(?:\.\d+)?)px\s+(?:solid|dashed|dotted|double)/.exec(declarations['border'] ?? '');
  return width === null ? 0 : Number(width[1]);
};

/** The three painted box classes: Node, open Group and collapsed Group. */
const BOXES = ELEMENTS.map((key) => `& .rd-${key}`).join(', ');

/**
 * Paint of an element (Node, open or collapsed Group): the box of its base stack and of each patched Node kind
 * (`data-tipo`), the change each state brings (`data-estados`), the radius of the state outline and the style of its Slots.
 */
function elementRules(style: Style, key: (typeof ELEMENTS)[number]): Array<[string, Declarations]> {
  const output: Array<[string, Declarations]> = [];
  for (const { selector, box: container, stack } of elementStacks(style.paint, key)) {
    const rest = boxDeclarations(style, stack);
    // In every box rule (also with 0): the variable is inherited and a Slot of a borderless Node must not take its Group's.
    output.push([selector, { ...rest, [BORDER_VARIABLE]: px(borderWidth(rest)) }]);
    for (const state of STATES) {
      const ofState = stack.estados[state];
      if (ofState === undefined) continue;
      const changes = difference(rest, boxDeclarations(style, stack, ofState));
      if (Object.keys(changes).length > 0) output.push([`${selector}[data-estados~="${state}"]`, changes]);
    }
    output.push([`${container} .rd-estado`, { 'border-radius': rest['border-radius'] ?? '0px' }]);
  }
  const texts = elementPaint(style.paint, key).textos;
  return [...output, ...textRules(`& .rd-${key}`, texts, style.monoFont), ...iconRules(`& .rd-${key}`, texts)];
}

/** Unscoped rules: selector (with `&` for the scope class) and declarations. */
function rules(style: Style): Array<[string, Declarations]> {
  const { metrics } = style;
  return [
    ['&', { position: 'relative', overflow: 'hidden', 'user-select': 'none', background: css(style.background), color: css(style.text), 'font-family': css(style.bodyFont), 'font-size': px(metrics.fontSize) }],
    ['& .rd-mundo', { position: 'absolute', left: '0', top: '0', 'transform-origin': '0 0' }],
    ['& .rd-capa', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'pointer-events': 'none' }],
    ['& .rd-aristas', { overflow: 'visible' }],
    ['& .rd-aristas [data-edge], & .rd-aristas [data-edge-labels]', { 'pointer-events': 'stroke' }],
    ['& .rd-pagina', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'pointer-events': 'none', ...pageDeclarations(style.paint.pagina.capas) }],
    ['& .rd-caja', { position: 'absolute', left: '0', top: '0', contain: 'layout style' }],
    [BOXES, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'auto' }],
    ...ELEMENTS.flatMap((key) => elementRules(style, key)),
    ...EFFECT_RULES,
    // `code` Layer: fixed-size container (the box's, inline); the component cannot change it.
    ['& .rd-codigo', { position: 'absolute', left: '0', top: '0', 'pointer-events': 'none', contain: 'layout style' }],
    // Layer with `zone`: its own band of the box (its rectangle goes inline).
    ['& .rd-zona', { position: 'absolute', 'pointer-events': 'none', 'box-sizing': 'border-box' }],
    ['& .rd-slot, & .rd-icono', { margin: `calc(-1 * var(${BORDER_VARIABLE}, 0px))` }],
    // Rows take the rectangle `layout` reserved (up to the outer border): the fill does not cover the sides nor the foot of the border.
    ['& .rd-attrs', { 'clip-path': `inset(0 var(${BORDER_VARIABLE}, 0px) var(${BORDER_VARIABLE}, 0px))` }],
    ['& .rd-slot', { position: 'absolute', overflow: 'hidden', 'white-space': 'nowrap', 'text-overflow': 'ellipsis', 'box-sizing': 'border-box' }],
    ['& .rd-title', { 'text-align': 'center' }],
    // A Group title is a header: it aligns to the left of its Slot (a Theme `text-align` wins).
    ['& .rd-grupo .rd-title, & .rd-colapsado .rd-title', { 'text-align': 'left' }],
    // The counter is a small box with the number centered; without the `chip` style it has no box.
    ['& .rd-counter', { 'text-align': 'center', 'font-weight': '700' }],
    ['& .rd-separado', { 'border-top': '1px solid var(--trazo, currentColor)' }],
    ['& .rd-fila', { position: 'absolute', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'padding-left': px(metrics.margenDeTexto), 'box-sizing': 'border-box', 'font-family': css(style.monoFont), 'font-size': px(metrics.fontSize * metrics.escalaAtributo) }],
    // Key mark chip (ER): box with a border in the text color, on the right border of the row.
    ['& .rd-clave', { position: 'absolute', 'box-sizing': 'border-box', 'text-align': 'center', border: '1px solid currentColor', 'border-radius': '3px', opacity: '0.75', 'font-weight': '600' }],
    ['& .rd-icono', { position: 'absolute', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'box-sizing': 'border-box' }],
    // The collapse control is interaction chrome, not part of the Theme: it shows when hovering its box or with focus inside.
    ['& .rd-control', { position: 'absolute', 'text-align': 'center', cursor: 'pointer', 'font-family': css(style.monoFont), opacity: '0', transition: 'opacity 120ms' }],
    ['& .rd-caja:hover .rd-control, & .rd-caja:focus-within .rd-control', { opacity: '1' }],
    ['& .rd-estado', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'none' }],
    ['& [data-atenuado]', { opacity: num(style.states.dimmed.opacity) }],
    // Planned with the default look: dimmed (multiplied if it is also `dimmed`) and with dashed lines.
    ['& [data-planeado]', { opacity: num(style.states.planned.opacity) }],
    ['& [data-planeado][data-atenuado]', { opacity: num(style.states.planned.opacity * style.states.dimmed.opacity) }],
    ['& [data-planeado] > path[data-capa]', { 'stroke-dasharray': style.states.planned.stroke ?? 'none' }],
    ...(Object.keys(style.states) as VisualState[]).filter((state) => state !== 'dimmed').map((state): [string, Declarations] => [`& .rd-estado[data-state="${state}"]`, stateDeclarations(style, state)]),
  ];
}

/** Look of the `icon` Slot according to its `icon` style: box (radius, fill, border) or dot; the placement already set the side. */
function iconRules(box: string, texts: NodePaint['textos']): Array<[string, Declarations]> {
  const props = texts.icon?.props ?? {};
  const { radius, fill, border, ring } = props;
  const point = fill !== undefined ? css(fill) : 'currentColor';
  const outlineLook: Declarations = border === undefined ? {} : { border: `${px(props['border-width'] ?? 1)} solid ${css(border)}` };
  return [
    [`${box} .rd-icono[data-variante="box"]`, { 'border-radius': px(radius ?? 6), ...(fill !== undefined && { background: css(fill) }), ...outlineLook }],
    // With `ring`, the dot sits on a ring of that color: the dot takes 4/9 of the side.
    [
      `${box} .rd-icono[data-variante="dot"]`,
      {
        'border-radius': '50%',
        background: ring === undefined ? point : `radial-gradient(circle closest-side,${point} 0 ${DOT_ON_RING}%,${css(ring)} ${DOT_ON_RING + 2}%)`,
        ...outlineLook,
      },
    ],
  ];
}

/** Diameter of the dot over the ring of the `dot` icon, in % of the radius (8 px on an 18 ring). */
const DOT_ON_RING = 44;

/** Diameter of the title dot in em; the rest of `TITLE_DOT_EM` is the gap to the text. */
const DOT_DIAMETER_EM = 0.55;

/** Blur (px) of a text `glow`. */
const TEXT_GLOW = 8;

const CSS_ALIGNMENT: Record<string, string> = { start: 'left', center: 'center', end: 'right' };

/** CSS declarations of a text style (`text` or `chip`): color, weight, chip box, padding... Paint only. */
export function textDeclarations(text: PaintedPrimitive, monoFont: string): Declarations {
  const { weight, color, style, transform, alpha, fill, border, radius, tracking, pad, font, glow } = text.props;
  const outlineLook = border === undefined ? 'none' : `${px(text.props['border-width'] ?? 1)} solid ${css(border)}`;
  const alignment = text.props['text-align'];
  const withBox = fill !== undefined || border !== undefined || Number(radius) > 0;
  return {
    'font-weight': css(weight),
    ...(style !== undefined && { 'font-style': css(style) }),
    ...(font === 'mono' && { 'font-family': css(monoFont) }),
    'text-transform': transform === 'uppercase' ? 'uppercase' : 'none',
    ...(color !== undefined && { color: css(color) }),
    ...(alpha !== undefined && { opacity: css(alpha) }),
    ...(alignment !== undefined && { 'text-align': CSS_ALIGNMENT[String(alignment)] ?? 'left' }),
    ...(Number(tracking) > 0 && { 'letter-spacing': `${num(Number(tracking))}em` }),
    ...(glow !== undefined && { 'text-shadow': `0 0 ${px(TEXT_GLOW)} ${css(glow)}` }),
    ...(text.tipo === 'chip' && { 'border-radius': px(radius), ...(fill !== undefined && { background: css(fill) }), border: outlineLook }),
    ...(text.tipo === 'text' && withBox && { 'border-radius': px(radius), ...(fill !== undefined && { background: css(fill) }), ...(border !== undefined && { border: outlineLook }) }),
    ...(Number(pad) > 0 && { 'padding-left': px(pad), 'padding-right': px(pad) }),
  };
}

/**
 * Text style (`text`, or `chip` on the counter) of each Slot of an element whose Theme declares it. It is paint: the
 * size, height, letter spacing, dot and chip padding were already measured by the placement (`slotText`).
 */
function textRules(box: string, texts: NodePaint['textos'], monoFont: string): Array<[string, Declarations]> {
  return Object.entries(texts).flatMap(([slot, text]): Array<[string, Declarations]> => {
    if (text.tipo !== 'text' && text.tipo !== 'chip') return [];
    const { dot } = text.props;
    const selector = `${box} .rd-slot[data-slot="${slot}"]`;
    const ruleList: Array<[string, Declarations]> = [[selector, textDeclarations(text, monoFont)]];
    if (dot !== undefined) {
      ruleList.push([
        `${selector}::before`,
        { content: '""', display: 'inline-block', width: `${DOT_DIAMETER_EM}em`, height: `${DOT_DIAMETER_EM}em`, 'margin-right': `${num(TITLE_DOT_EM - DOT_DIAMETER_EM)}em`, 'border-radius': '50%', 'vertical-align': 'middle', background: css(dot) },
      ]);
    }
    return ruleList;
  });
}

const FONT_FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/**
 * `@font-face` of each Style face. `block` avoids measuring and painting with the fallback font and jumping afterwards.
 * Global, without scope class: a face belongs to the page.
 */
export function fontSheet(faces: Style['faces'], fontUrl: (path: string) => string): string {
  return faces
    .map((face) => {
      const format = FONT_FORMAT[face.ruta.slice(face.ruta.lastIndexOf('.') + 1).toLowerCase()] ?? 'woff2';
      const url = fontUrl(face.ruta).replace(/["'()\\<>{};\n\r]/g, encodeURIComponent);
      return `@font-face{font-family:"${face.familia.replace(/["\\]/g, '')}";font-style:${face.estilo};font-weight:${face.peso};font-display:block;src:url("${url}") format("${format}")}`;
    })
    .join('\n');
}

/** Style sheet of the Style: `className` is the scope class the drawing container must carry; with `sourceUrl` it includes the `@font-face`s. */
export function compileSheet(style: Style, fontUrl?: (path: string) => string): { className: string; css: string } {
  const animation = sheetAnimation(style, (layer) => PAINTERS[layer.tipo as PrimitiveNameAt<'capa-nodo'>](layer.props));
  const all = [...rules(style), ...animation.rules];
  const className = `rd-${fingerprint(all.map(([selector, d]) => `${selector}{${block(d)}}`).join('') + animation.blocks.join(''))}`;
  const scope = (selector: string): string => selector.replace(/&/g, `.${className}`);
  const faces = fontUrl === undefined || style.faces.length === 0 ? [] : [fontSheet(style.faces, fontUrl)];
  const text = [...faces, ...all.map(([selector, d]) => `${selector.split(', ').map(scope).join(',')}{${block(d)}}`), ...animation.blocks.map(scope)].join('\n');
  return { className, css: text };
}
