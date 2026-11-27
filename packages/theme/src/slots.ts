/**
 * Slot placement: the only place that decides positions (used by `layout` and `render`). Rectangles relative to the
 * top left corner of the Node box. A box reserves `pad` per side and `gap` between present children
 * (nothing if it has none). In `column` each child takes its natural height and, without `align`, the full width; in `row`
 * the flexible ones share the free width and, without `align`, are centered vertically. With `align` a child takes its
 * natural size.
 */

import { SLOT_DEFINITION, TEXT_SLOTS } from './catalog';
import type { SlotDefinition, SlotName, TextSlotName } from './catalog';
import { isBox, slotsOf } from './slot-layout';
import type { Alignment, SlotLayoutBox, SlotLayoutElement } from './slot-layout';
import { textWidth } from './measurement';
import type { TextToMeasure } from './measurement';
import { chipsWidth, sample, attributePieces } from './content';
import type { NodeContent } from './content';
import type { Metrics } from './metrics';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** `undefined`: the Slot reserves no space. `elastico` overrides the one in `SLOT_DEFINITION`. */
export type SlotMeasure = (slot: SlotName) => (Size & { elastico?: boolean }) | undefined;

interface Measured {
  tam: Size;
  elastico: boolean;
  align?: Alignment | undefined;
  slot?: SlotName;
  caja?: SlotLayoutBox;
  hijos: Measured[];
}

const margins = (box: SlotLayoutBox): { x: number; y: number } => ({ x: box.pad, y: box.padY ?? box.pad });

function measureElement(element: SlotLayoutElement, measure: SlotMeasure): Measured | undefined {
  if (!isBox(element)) {
    const measured = measure(element.slot);
    if (measured === undefined) return undefined;
    const { elastico: flexible = SLOT_DEFINITION[element.slot].elastico, ...sz } = measured;
    return { tam: sz, elastico: flexible, align: element.align, slot: element.slot, hijos: [] };
  }
  const children = element.hijos.flatMap((child) => measureElement(child, measure) ?? []);
  if (children.length === 0) return undefined;
  const horizontal = element.direccion === 'row';
  const { x: padX, y: padY } = margins(element);
  const sum = children.reduce((total, h) => total + (horizontal ? h.tam.width : h.tam.height), 0) + element.gap * (children.length - 1);
  const largest = Math.max(...children.map((h) => (horizontal ? h.tam.height : h.tam.width)));
  const width = (horizontal ? sum : largest) + 2 * padX + (element.holgura ?? 0);
  const height = (horizontal ? largest : sum) + 2 * padY;
  return {
    tam: { width: Math.max(width, element.anchoMinimo ?? 0), height: Math.max(height, element.altoMinimo ?? 0) },
    elastico: children.some((h) => h.elastico),
    align: element.align,
    caja: element,
    hijos: children,
  };
}

function place(node: Measured, rect: Rect, output: Partial<Record<SlotName, Rect>>): void {
  if (node.slot !== undefined) {
    output[node.slot] = rect;
    return;
  }
  const box = node.caja!;
  const horizontal = box.direccion === 'row';
  const { x: padX, y: padY } = margins(box);
  const inside: Rect = { x: rect.x + padX, y: rect.y + padY, width: Math.max(0, rect.width - 2 * padX), height: Math.max(0, rect.height - 2 * padY) };
  const mainFree = horizontal ? inside.width : inside.height;
  const fixed = node.hijos.reduce((sum, h) => sum + (horizontal ? (h.elastico ? 0 : h.tam.width) : h.tam.height), 0) + box.gap * (node.hijos.length - 1);
  const flexibles = horizontal ? node.hijos.filter((h) => h.elastico).length : 0;
  const part = flexibles === 0 ? 0 : Math.max(0, mainFree - fixed) / flexibles;
  let cursor = horizontal ? inside.x : inside.y;
  for (const child of node.hijos) {
    const main = horizontal ? (child.elastico ? part : child.tam.width) : child.tam.height;
    const crossedTotal = horizontal ? inside.height : inside.width;
    const natural = horizontal ? child.tam.height : child.tam.width;
    const alignment = child.align ?? (horizontal ? 'center' : undefined);
    const crossed = alignment === undefined ? crossedTotal : Math.min(natural, crossedTotal);
    const origin = (horizontal ? inside.y : inside.x) + (alignment === 'end' ? crossedTotal - crossed : alignment === 'center' ? (crossedTotal - crossed) / 2 : 0);
    place(child, horizontal ? { x: cursor, y: origin, width: main, height: crossed } : { x: origin, y: cursor, width: crossed, height: main }, output);
    cursor += main + box.gap;
  }
}

/** Unstretched size; empty, 0 x 0. */
export function measureLayout(tree: SlotLayoutBox, measure: SlotMeasure): Size {
  return measureElement(tree, measure)?.tam ?? { width: 0, height: 0 };
}

/** Knows no Slot by name; those `measure` does not reserve are absent from the result. */
export function placeLayout(tree: SlotLayoutBox, measure: SlotMeasure, width: number): { slots: Partial<Record<SlotName, Rect>>; alto: number } {
  const measured = measureElement(tree, measure);
  const slots: Partial<Record<SlotName, Rect>> = {};
  if (measured === undefined) return { slots, alto: 0 };
  place(measured, { x: 0, y: 0, width, height: measured.tam.height }, slots);
  return { slots, alto: measured.tam.height };
}

export interface NodePlacement {
  width: number;
  height: number;
  slots: Partial<Record<SlotName, Rect>>;
  /** Empty without `attrs`. */
  filas: Rect[];
}

/** Padding plus border of the counter box. */
const CHIP_SLACK = { x: 14, y: 2 };

/** Diameter plus gap of the title dot, in em. */
export const TITLE_DOT_EM = 1;

/** `undefined`: the Node has no such content and the Slot reserves no space. */
export function slotText(slot: TextSlotName, metrics: Metrics, content: NodeContent): (TextToMeasure & { alto: number; holgura: number }) | undefined {
  const raw = { title: content.titulo, badge: content.tipo, desc: content.descripcion, footer: content.fuente, counter: content.cuenta?.toString() }[slot];
  if (raw === undefined || (raw === '' && slot !== 'title')) return undefined;
  const style = slot === 'title' ? metrics.titulo : undefined;
  const { size, leading, mono, peso: weight, prefijo: prefixText = '', borde: border = 0 } = metrics.medidaDeTexto[slot] ?? {};
  const text = prefixText + (style?.mayusculas === true ? raw.toUpperCase() : raw);
  const definition: SlotDefinition = SLOT_DEFINITION[slot];
  const pixelSize = metrics.fontSize * (size ?? definition.escala ?? 1);
  const lineSpacing = leading ?? definition.interlineado;
  const chip = slot === 'counter';
  return {
    familia: metrics.fuentes[mono === true ? 'mono' : 'body']!,
    tamano: pixelSize,
    texto: text,
    ...(weight !== undefined && { peso: weight }),
    alto: (lineSpacing === undefined ? metrics.cabecera : Math.ceil(pixelSize * lineSpacing)) + (chip ? CHIP_SLACK.y + 2 * border : 0),
    holgura: chip ? CHIP_SLACK.x + 2 * border : style === undefined ? 0 : style.tracking * pixelSize * text.length + (style.punto ? TITLE_DOT_EM * pixelSize : 0) + 2 * (style.relleno + style.borde),
  };
}

function nodeMeasures(metrics: Metrics, content: NodeContent): SlotMeasure {
  const { fuentes: fonts } = metrics;
  const ofText = (slot: TextSlotName) => (): Size | undefined => {
    const t = slotText(slot, metrics, content);
    return t === undefined ? undefined : { width: textWidth(metrics, t.familia, t.tamano, t.texto, t.peso) + t.holgura, height: t.alto, ...(slot === 'title' && { elastico: !metrics.titulo.caja }) };
  };
  const measures: Record<SlotName, () => Size | undefined> = {
    icon: () => (content.icono ? { width: metrics.iconoLado, height: metrics.iconoLado } : undefined),
    title: ofText('title'),
    badge: ofText('badge'),
    desc: ofText('desc'),
    footer: ofText('footer'),
    counter: ofText('counter'),
    attrs: () =>
      content.atributos.length === 0
        ? undefined
        : {
            width: Math.max(...content.atributos.map((a) => attributePieces(a, metrics).reduce((sum, p) => sum + textWidth(metrics, fonts['mono']!, p.tamano, p.texto), 0) + chipsWidth(a, metrics))),
            height: content.atributos.length * metrics.fila,
          },
  };
  return (slot) => measures[slot]();
}

/** The same ones `nodeMeasures` measures, only for the Slots the Theme shows. */
export function nodeTexts(metrics: Metrics, content: NodeContent): TextToMeasure[] {
  const ofText = TEXT_SLOTS.filter((slot) => sample(metrics, slot)).flatMap((slot) => slotText(slot, metrics, content) ?? []);
  const attributes = content.atributos.flatMap((a) => attributePieces(a, metrics).map(({ texto: text, tamano: pixelSize }) => ({ familia: metrics.fuentes['mono']!, tamano: pixelSize, texto: text })));
  return [...ofText.map(({ familia: family, tamano: pixelSize, texto: text, peso: weight }) => ({ familia: family, tamano: pixelSize, texto: text, ...(weight !== undefined && { peso: weight }) })), ...attributes];
}

/** Leaf Node or Collapsed group, with `atributos` already filtered by `visibleAttributes`. */
export function placeNode(content: NodeContent, metrics: Metrics): NodePlacement {
  const root = { ...metrics.disposicion, holgura: metrics.paddingHorizontal };
  const natural = measureLayout(root, nodeMeasures(metrics, content));
  const width = Math.max(metrics.anchoMinimo, Math.ceil(natural.width));
  return placeInBox(metrics, content, metrics.cajaCuadrada ? Math.max(width, natural.height) : width);
}

/** Inside a box of known width (the Geometry one). */
export function placeInBox(metrics: Metrics, content: NodeContent, width: number): NodePlacement {
  const { slots: raws, alto: naturalHeight } = placeLayout(metrics.disposicion, nodeMeasures(metrics, content), width);
  const height = metrics.cajaCuadrada ? Math.max(naturalHeight, width) : naturalHeight;
  const offset = (height - naturalHeight) / 2;
  const slots = Object.fromEntries(Object.entries(raws).map(([name, r]) => [name, { ...r, y: r.y + offset }])) as NodePlacement['slots'];
  const zone = slots.attrs;
  return {
    width,
    height,
    slots,
    filas:
      zone === undefined
        ? []
        : Array.from({ length: content.atributos.length }, (_, i) => ({ x: zone.x, y: zone.y + i * metrics.fila, width: zone.width, height: metrics.fila })),
  };
}

/** `metrics` is the `grupoAbierto` entry; it depends neither on the text nor on the Group. */
export function headerHeight(metrics: Metrics): number {
  const icon = slotsOf(metrics.disposicion).includes('icon');
  return measureLayout(metrics.disposicion, nodeMeasures(metrics, { titulo: '', atributos: [], icono: icon })).height;
}
