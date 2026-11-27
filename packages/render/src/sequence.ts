/**
 * Scene of a sequence View (ADR 0009): Lifelines, activations, Messages, Fragments and Notes over the `secuencia`
 * Geometry, with the stacks already resolved in `style.paint.secuencia`. The Lifeline heads are Nodes.
 */
import { sequenceElementId } from 'canonical';
import type { ActivationBox, PlacedGroupBox, SequenceGeometry, FragmentFrame, ResolvedMessage, ResolvedNode, PlacedNote, Visibility, SequenceView } from 'canonical';
import { geometryIndex } from 'layout';
import { STATES, NOTE_PADDING, primitivesOfFamily } from 'theme';
import type { PaintedLayer, SequenceBoxPaint, SequenceStrokePaint, SequenceStrokes } from 'theme';

import { inlineStyle, num } from './element';
import type { MarkupElement } from './element';
import { resolveStyle } from './style';
import { flatten, nodeBox, layerSvg, strokeColor, outlines, strokeState, strokeMarks, sceneFrame, plannedLook, accessibleNames, opacity, staggerPositions, svgVisibility } from './scene';
import type { Context, SceneInput, States } from './scene';
import { boxDeclarations } from './sheet';
import { nodeStack } from './stacks';
import { paintEdgeLabel, paintPathState } from './painters';
import { paintMarkers, paintStrokes } from './edges';

/** Absolute box `x,y,width,height` (px), with the border inside the size: the frame of everything in a sequence painted in HTML. */
const absoluteBox = (x: number, y: number, width: number, height: number): string => `position:absolute;box-sizing:border-box;left:${num(x)}px;top:${num(y)}px;width:${num(width)}px;height:${num(height)}px`;

/** The stroke of a sequence Element for a source Node with Palette color `color`. */
const ofColor = (strokes: SequenceStrokes, color: string | undefined): SequenceStrokePaint => (color === undefined ? undefined : strokes.origenes[color]) ?? strokes.base;

export function buildSequenceScene(input: SceneInput & { view: SequenceView; geometry: SequenceGeometry }): MarkupElement {
  const { view, geometry, theme } = input;
  const style = input.style ?? resolveStyle(theme, view.type, input.metrics);
  const { roots, boxes } = geometryIndex(view, geometry);
  const visibility = input.visibility ?? (() => 1);
  const nodeColors = new Map(roots.flatMap((root) => flatten(root)).map((node) => [node.id, node.color]));
  const context: Context = { ...input, visibility, style, boxes, nodeColors, stagger: staggerPositions(roots, visibility, style, input.fresh) };
  // A sequence View has no Edges: the accessible name of a Lifeline announces no relations.
  context.names = accessibleNames([], roots);

  const interaction = view.interaction;
  const messages = interaction.messages;
  const sequence = style.paint.secuencia;
  if (sequence === undefined) throw new Error('buildSequenceScene: the Style is not from a sequence View');
  const lifelines = roots.flatMap((node): MarkupElement[] => {
    const line = geometry.lifelines[node.id];
    if (line === undefined) return [];
    // Only a destroyed Lifeline carries its end marker.
    const { capas: layers, fin: end } = ofColor(sequence.lifeline, nodeColors.get(node.id));
    const paint = { capas: layers, ...(line.destroyed === true && end !== undefined && { fin: end }) };
    const v = svgVisibility(visibility(node.id));
    const points = [{ x: line.x, y: line.y1 }, { x: line.x, y: line.y2 }];
    return [
      {
        tag: 'g',
        attrs: { 'data-lifeline': node.id, ...v, ...strokeMarks(input.states, node.id) },
        ...(input.onSelect !== undefined && { onClick: () => input.onSelect!(node.id) }),
        children: [...paintStrokes(paint, points, style.paint.semilla), ...paintMarkers(style, paint, points)],
      },
    ];
  });

  const idOf = (message: ResolvedMessage): string => sequenceElementId(interaction.id, message.path);
  // Step cutoff: the `y` of the last revealed Message. With all revealed nothing is clipped.
  const revealed = messages.flatMap((message) => {
    const path = geometry.messages[message.path];
    return path !== undefined && visibility(idOf(message)) > 0 ? [Math.max(...path.points.map((p) => p.y))] : [];
  });
  const hasHidden = messages.some((message) => geometry.messages[message.path] !== undefined && visibility(idOf(message)) <= 0);
  const cutoff = hasHidden ? Math.max(-Infinity, ...revealed) : Infinity;
  // A Lifeline clipped by the viewport (its head was left outside the camera) does not paint its activations.
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const activations = geometry.activations.flatMap((activation) => {
    const node = nodeById.get(activation.lifeline);
    return node === undefined ? [] : [activationHtml(activation, node, context, cutoff)];
  });
  const interactionId = interaction.id;
  const paths = messages.flatMap((message) => {
    const path = geometry.messages[message.path];
    return path === undefined ? [] : [{ message, path }];
  });
  const strokes = paths.map(({ message, path }): MarkupElement => {
    const id = idOf(message);
    const v = svgVisibility(visibility(id));
    const ofType = ofColor(sequence.mensaje, nodeColors.get(message.from)).tipos[message.kind]!;
    // A state the Theme declares for Messages swaps the stroke stack (paint-only); markers stay.
    const inState = strokeState(ofType.estados, input.states, id);
    const paint = inState === undefined ? ofType : { ...ofType, capas: inState };
    return {
      tag: 'g',
      attrs: { 'data-edge': id, 'data-message': id, 'data-kind': message.kind, ...v, ...strokeMarks(input.states, id, ofType.estados?.planned !== undefined) },
      children: [...paintStrokes(paint, path.points, style.paint.semilla), ...paintMarkers(style, paint, path.points), ...outlines(input.states?.[id]).map((e) => paintPathState(style, e, id, path.points))],
    };
  });
  const labels = paths.flatMap(({ message, path }): MarkupElement[] => {
    if (message.label === undefined) return [];
    const id = idOf(message);
    const ownPlanned = ofColor(sequence.mensaje, nodeColors.get(message.from)).tipos[message.kind]?.estados?.planned !== undefined;
    return [{ tag: 'g', attrs: { 'data-edge-labels': id, ...svgVisibility(visibility(id)), ...(plannedLook(input.states, id) && !ownPlanned && { 'data-planeado': '' }) }, children: [paintEdgeLabel(style, { id, text: message.label, points: path.points, box: path.label })] }];
  });

  const groups = geometry.groups.map((group) => groupHtml(group, context));
  const fragments = geometry.fragments.map((frame) => fragmentHtml(frame, context, interactionId));
  // Guards go over the activations.
  const fragmentTexts = geometry.fragments.flatMap((frame) => fragmentTextsSvg(frame, style, visibility, interactionId));

  return sceneFrame(input, style, [
    { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, children: groups },
    { tag: 'div', attrs: { class: 'rd-capa rd-fragmentos', 'data-capa': 'fragmentos' }, children: fragments },
    layerSvg('lifelines', geometry, lifelines),
    { tag: 'div', attrs: { class: 'rd-capa rd-activaciones', 'data-capa': 'activaciones' }, children: activations },
    layerSvg('mensajes', geometry, [...strokes, ...labels]),
    layerSvg('guardas', geometry, fragmentTexts),
    layerSvg('notas', geometry, geometry.notes.map((note) => noteSvg(note, style, interactionId, visibility, input.states))),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, children: roots.map((node) => nodeBox(node, context)) },
  ]);
}

/** Activation bar: the `activation` stack (the derived one goes through its Lifeline's Node), with that Node's color. */
function activationHtml(activation: ActivationBox, node: ResolvedNode, context: Context, cutoff: number): MarkupElement {
  const { style, onSelect } = context;
  const paint = style.paint.secuencia!.activacion;
  const layers = paint.porNodo === undefined ? paint.capas : nodeStack(paint.porNodo, node).stack.capas;
  const styles = inlineStyle(boxDeclarations(style, { capas: layers, estados: {} }));
  // A Step clips the activation at the cutoff (it does not announce the `reply`); one that has not started yet is not shown.
  const y2 = Math.min(activation.y2, cutoff);
  const height = Math.max(y2 - activation.y1, 0);
  const hidden = activation.y1 > cutoff ? 'opacity:0;pointer-events:none;' : '';
  return {
    tag: 'div',
    attrs: {
      'data-activation': activation.lifeline,
      'data-nivel': String(activation.nivel),
      style: `${absoluteBox(activation.x, activation.y1, activation.width, height)};--trazo:${strokeColor(node, style)};pointer-events:auto;${styles}${hidden}`,
    },
    ...(onSelect !== undefined && { onClick: () => onSelect(activation.lifeline) }),
    children: [],
  };
}

/** Inline style of a box with the `capas` of its Theme Element. */
const boxStyle = (context: Context, layers: readonly PaintedLayer[]): string => inlineStyle(boxDeclarations(context.style, { capas: [...layers], estados: {} }));

/** States of the element (`selected`, `hover`) as an attribute; Fragments and Notes are styled with their Theme Elements. */
const statesAttribute = (states: States | undefined, id: string): Record<string, string> => {
  const list = outlines(states?.[id]);
  return list.length === 0 ? {} : { 'data-estados': list.join(' ') };
};

/** `box` of an open Group: dashed outline in the stroke color with the Group name at the top left. */
function groupHtml(group: PlacedGroupBox, context: Context): MarkupElement {
  const { style } = context;
  const fontSizeValue = style.metrics.fontSize * style.metrics.escalaEtiqueta;
  return {
    tag: 'div',
    attrs: { 'data-group-box': group.id, 'data-nivel': String(group.nivel), style: `${absoluteBox(group.x, group.y, group.width, group.height)};pointer-events:none;border:1px dashed ${style.border}` },
    children: [
      {
        tag: 'div',
        attrs: { 'data-group-box-title': group.id, style: `${absoluteBox(group.title.x - group.x, group.title.y - group.y, group.title.width, group.title.height)};font-family:${style.bodyFont};font-size:${num(fontSizeValue)}px;line-height:${num(group.title.height)}px;color:${style.text};white-space:nowrap` },
        children: [group.label],
      },
    ],
  };
}

/** Layer stack of a Fragment's frame: its `op`'s or the `fragment` block's, in the current state. */
function fragmentLayers(paint: SequenceBoxPaint, operator: string, state?: SequenceBoxPaint['estados'][keyof SequenceBoxPaint['estados']]): readonly PaintedLayer[] {
  return state === undefined ? (paint.variantes[operator] ?? paint.capas) : (state.variantes[operator] ?? state.capas);
}

/** Stack of the state that rules an element: the last of `STATES` the element carries and the Theme declares (the Nodes' sheet order). */
function stateStack(declared: SequenceBoxPaint | undefined, states: States | undefined, id: string): SequenceBoxPaint['estados'][keyof SequenceBoxPaint['estados']] {
  const active = outlines(states?.[id]);
  const current = STATES.filter((state) => active.includes(state) && declared?.estados[state] !== undefined).at(-1);
  return current === undefined ? undefined : declared?.estados[current];
}

/** `border-top` CSS declaration of the Fragment's `divider` stroke (`line`): its width, style and color. */
function dividerBorder(paint: SequenceBoxPaint): string {
  const { props } = paint.textos['divider']!;
  const style = String(props['style']);
  return `${num(Number(props['width']))}px ${style === 'dashed' || style === 'dotted' ? style : 'solid'} ${String(props['color'])}`;
}

/** Frame of a Fragment with the `fragment` stack; with its tab and a divider per operand from the second one. */
function fragmentHtml(frame: FragmentFrame, context: Context, interaction: string): MarkupElement {
  const paint = context.style.paint.secuencia!.fragmento;
  const styles = boxStyle(context, fragmentLayers(paint, frame.operator, stateStack(paint, context.states, sequenceElementId(interaction, frame.ruta))));
  const border = dividerBorder(paint);
  const dividers = frame.operands.flatMap((operand, k): MarkupElement[] =>
    operand.divider === undefined ? [] : [{ tag: 'div', attrs: { 'data-fragment-divider': `${frame.ruta}:${k}`, style: `${absoluteBox(0, operand.divider - frame.y, frame.width, 0)};border-top:${border};${opacity(context.visibility(sequenceElementId(interaction, frame.ruta, k)))}` }, children: [] }],
  );
  return {
    tag: 'div',
    attrs: { 'data-fragment': frame.ruta, 'data-operator': frame.operator, 'data-nivel': String(frame.nivel), ...statesAttribute(context.states, sequenceElementId(interaction, frame.ruta)), style: `${absoluteBox(frame.x, frame.y, frame.width, frame.height)};pointer-events:none;${styles};${opacity(context.visibility(sequenceElementId(interaction, frame.ruta)))}` },
    children: [{ tag: 'div', attrs: { 'data-fragment-tab': frame.ruta, style: `${absoluteBox(frame.tab.x - frame.x, frame.tab.y - frame.y, frame.tab.width, frame.tab.height)};${styles}` }, children: [] }, ...dividers],
  };
}

/** SVG text of the tab (operator) and of each guard, centered in their measured boxes. The Theme's `operator` and `guard` give color and weight. */
function fragmentTextsSvg(frame: FragmentFrame, style: Context['style'], visibility: Visibility, interaction: string): MarkupElement[] {
  const fontSizeValue = style.metrics.fontSize * style.metrics.escalaEtiqueta;
  const paint = style.paint.secuencia!.fragmento;
  const ofOperator = paint.textos['operator']?.props;
  const ofGuard = paint.textos['guard']?.props;
  const color = paint.colorDeGuarda;
  const text = (visibilityValue: number, attributes: Record<string, string>, box: { x: number; y: number; width: number; height: number }, contents: string, fill: string, props?: Record<string, number | string>): MarkupElement => ({
    tag: 'text',
    attrs: {
      ...attributes,
      ...svgVisibility(visibilityValue),
      x: num(box.x + box.width / 2),
      y: num(box.y + box.height / 2 + fontSizeValue * style.label.verticalCentering),
      'text-anchor': 'middle',
      'font-family': style.bodyFont,
      'font-size': num(fontSizeValue),
      fill: props?.['color'] === undefined ? fill : String(props['color']),
      ...(props?.['weight'] !== undefined && { 'font-weight': String(props['weight']) }),
    },
    children: [contents],
  });
  return [
    text(visibility(sequenceElementId(interaction, frame.ruta)), { 'data-fragment-operator': frame.ruta }, frame.tab, frame.operator, style.text, ofOperator),
    ...(frame.title === undefined ? [] : [text(visibility(sequenceElementId(interaction, frame.ruta)), { 'data-ref-title': frame.ruta }, frame.title.box, frame.title.text, style.text, ofGuard)]),
    ...frame.operands.flatMap((operand, k): MarkupElement[] => (operand.guard === undefined ? [] : [text(visibility(sequenceElementId(interaction, frame.ruta, k)), { 'data-fragment-guard': `${frame.ruta}:${k}` }, operand.guard.box, operand.guard.text, color, ofGuard)])),
  ];
}

/**
 * "Paper" Note: polygon with the top right corner folded, the fill and border of the `note` stack (with the
 * color and opacity of its paper) and the text already wrapped by the layout. It is not a Node: no head, icon nor badge.
 */
function noteSvg(note: PlacedNote, style: Context['style'], interaction: string, visibility: Visibility, states: States | undefined): MarkupElement {
  const paint = style.paint.secuencia!.nota;
  const currentLayers = stateStack(paint, states, sequenceElementId(interaction, note.ruta))?.capas ?? paint.capas;
  const last = (family: 'relleno' | 'borde'): PaintedLayer | undefined => currentLayers.filter((layer) => primitivesOfFamily(family).includes(layer.tipo)).at(-1);
  const { papel } = paint;
  const fillLayer = last('relleno');
  const borderLayer = last('borde');
  const color = String(borderLayer?.props['color'] ?? papel.color);
  const fill = fillLayer === undefined ? 'none' : String(fillLayer.props['color'] ?? papel.color);
  const fillOpacity = num(papel.opacidadDeRelleno);
  const strokeWidth = num(Number(borderLayer?.props['width'] ?? 1));
  const textStyle = paint.textos['text']?.props;
  const { x, y, width, height, fold } = note;
  const outlineLook = `M${num(x)},${num(y)} H${num(x + width - fold)} L${num(x + width)},${num(y + fold)} V${num(y + height)} H${num(x)} Z`;
  const foldSize = `M${num(x + width - fold)},${num(y)} V${num(y + fold)} H${num(x + width)}`;
  const fontSizeValue = style.metrics.fontSize;
  const lines = note.lines.map((line, i): MarkupElement => ({
    tag: 'text',
    attrs: { x: num(x + NOTE_PADDING), y: num(y + NOTE_PADDING + i * note.lineHeight + note.lineHeight / 2 + fontSizeValue * style.label.verticalCentering), 'font-family': style.bodyFont, 'font-size': num(fontSizeValue), fill: textStyle?.['color'] === undefined ? style.text : String(textStyle['color']), ...(textStyle?.['weight'] !== undefined && { 'font-weight': String(textStyle['weight']) }) },
    children: [line],
  }));
  return {
    tag: 'g',
    attrs: { 'data-note': sequenceElementId(interaction, note.ruta), 'data-anchor': note.anchor, ...statesAttribute(states, sequenceElementId(interaction, note.ruta)), ...svgVisibility(visibility(sequenceElementId(interaction, note.ruta))) },
    children: [
      { tag: 'path', attrs: { 'data-note-paper': '', d: outlineLook, fill, 'fill-opacity': fillOpacity, stroke: color, 'stroke-width': strokeWidth }, children: [] },
      { tag: 'path', attrs: { d: foldSize, fill: 'none', stroke: color, 'stroke-width': strokeWidth }, children: [] },
      ...lines,
    ],
  };
}
