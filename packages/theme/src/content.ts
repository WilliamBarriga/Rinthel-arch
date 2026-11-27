/** Leaf module: used by `metrics` and `slots` without depending on each other. */

import type { Attribute, AttributeKey, ResolvedNode } from 'canonical';

import type { SlotName } from './catalog';
import { slotsOf } from './slot-layout';
import type { SlotLayoutBox } from './slot-layout';
import type { Metrics } from './metrics';

export interface NodeContent {
  titulo: string;
  atributos: readonly Attribute[];
  icono: boolean;
  /** Slot `badge`. */
  tipo?: string;
  /** Slot `desc`; when empty, the Slot reserves no space. */
  descripcion?: string;
  /** First source of the Node (Slot `footer`). */
  fuente?: string;
  /** Children hidden by a Collapsed group (Slot `counter`); only present when collapsed. */
  cuenta?: number;
}

/** Only those of a leaf Node (a Collapsed group is a leaf) and only if the Theme lists the `attrs` Slot. */
export function visibleAttributes(
  node: Pick<ResolvedNode, 'children' | 'attributes'>,
  metrics: Pick<Metrics, 'disposicion'>,
): readonly Attribute[] {
  return node.children.length === 0 && sample(metrics, 'attrs') ? node.attributes : [];
}

const lists = new WeakMap<SlotLayoutBox, readonly SlotName[]>();

/** Memoized per Slot layout. */
export function sample(metrics: Pick<Metrics, 'disposicion'>, slot: SlotName): boolean {
  let list = lists.get(metrics.disposicion);
  if (list === undefined) lists.set(metrics.disposicion, (list = slotsOf(metrics.disposicion)));
  return list.includes(slot);
}

export function nodeContent(
  node: Pick<ResolvedNode, 'children' | 'attributes' | 'label' | 'icon' | 'type' | 'description' | 'source' | 'collapsed' | 'childCount'>,
  metrics: Pick<Metrics, 'disposicion' | 'iconoEsPunto'>,
): NodeContent {
  const count = node.collapsed ? node.childCount : undefined;
  return {
    // Without a `counter` Slot, a Collapsed group tells in its title how many children it hides.
    titulo: count !== undefined && !sample(metrics, 'counter') ? `${node.label} (${count})` : node.label,
    atributos: visibleAttributes(node, metrics),
    icono: node.icon !== undefined || metrics.iconoEsPunto,
    tipo: node.type,
    descripcion: node.description,
    ...(node.source[0] !== undefined && { fuente: node.source[0].ref }),
    ...(count !== undefined && { cuenta: count }),
  };
}

/** With `marks` (ER View) the type carries `?` if the Attribute is optional. */
export function attributeText(attribute: Attribute, marks = false): string {
  return `${attribute.name}: ${attribute.type}${marks && attribute.optional === true ? '?' : ''}`;
}

/** `tamano` en px. */
export interface AttributePiece {
  texto: string;
  tamano: number;
}

/** With `metrics.tamanoDeFila` the name and the type are pieces of different sizes; without it, a single piece at the `attrs` size. */
export function attributePieces(attribute: Attribute, metrics: Pick<Metrics, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): AttributePiece[] {
  const marks = metrics.marcasDeClave === true;
  const base = metrics.fontSize * metrics.escalaAtributo;
  const { name, type } = metrics.tamanoDeFila ?? {};
  if (!marks || (name === undefined && type === undefined)) return [{ texto: attributeText(attribute, marks), tamano: base }];
  return [
    { texto: attribute.name, tamano: name ?? base },
    { texto: ': ', tamano: base },
    { texto: `${attribute.type}${attribute.optional === true ? '?' : ''}`, tamano: type ?? base },
  ];
}

/** `derecha` is its distance to the right edge of the row. `planned` is the Planned mark (ADR 0011), after the key marks. */
export interface KeyChip {
  clave: AttributeKey | 'planned';
  texto: string;
  derecha: number;
  width: number;
  tamano: number;
}

const CHIP_GAP = 4;
const CHIPS_RIGHT_MARGIN = 6;
const SLACK_BEFORE_CHIPS = 12;

/** Text of the Planned mark chip. */
const PLANNED_TEXT = 'PLAN';

/**
 * Left to right in the order of `keys` and, if the Attribute carries the `planned` mark, its chip last; empty
 * outside an ER View (`metrics.marcasDeClave`). A chip's width comes from its text.
 */
export function keyChips(attribute: Pick<Attribute, 'keys' | 'planned'>, metrics: Pick<Metrics, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): KeyChip[] {
  if (metrics.marcasDeClave !== true) return [];
  const marks: Array<AttributeKey | 'planned'> = [...(attribute.keys ?? []), ...(attribute.planned === true ? (['planned'] as const) : [])];
  const size = metrics.tamanoDeFila?.key ?? Math.round(metrics.fontSize * metrics.escalaAtributo * 0.8 * 10) / 10;
  const chips: KeyChip[] = [];
  let right = CHIPS_RIGHT_MARGIN;
  for (const key of [...marks].reverse()) {
    const text = key === 'planned' ? PLANNED_TEXT : key.toUpperCase();
    const width = Math.ceil(text.length * size * 0.62 + 8);
    chips.unshift({ clave: key, texto: text, derecha: right, width, tamano: size });
    right += width + CHIP_GAP;
  }
  return chips;
}

/** Includes the slack separating them from the text; 0 without chips. */
export function chipsWidth(attribute: Pick<Attribute, 'keys' | 'planned'>, metrics: Pick<Metrics, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): number {
  const chips = keyChips(attribute, metrics);
  return chips.length === 0 ? 0 : SLACK_BEFORE_CHIPS + Math.max(...chips.map((c) => c.derecha + c.width));
}
