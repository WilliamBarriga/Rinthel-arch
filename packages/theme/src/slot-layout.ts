/** Slot tree of the Theme and its validation. Child order is the visual order; a Slot outside the tree is neither painted nor measured. */
import { CODES } from 'canonical';

import { SLOTS, isSlot, suggest, validateProperties } from './catalog';
import type { PropertyDefinition, CatalogError, SlotName } from './catalog';

export const ALIGNMENTS = ['start', 'center', 'end'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];
export const DIRECTIONS = ['row', 'column'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** `align` places the Slot on the cross axis; without it, the box decides. */
export interface SlotLayoutLeaf {
  slot: SlotName;
  align?: Alignment;
}

export interface SlotLayoutBox {
  direccion: Direction;
  gap: number;
  /** On each side; `padY`, if present, replaces the top and bottom one. */
  pad: number;
  padY?: number;
  /** Includes the inner padding. */
  anchoMinimo?: number;
  altoMinimo?: number;
  /** `slack`: free width after the content; at the root it replaces the default slack of the Metrics. */
  holgura?: number;
  align?: Alignment;
  hijos: SlotLayoutElement[];
}

export type SlotLayoutElement = SlotLayoutLeaf | SlotLayoutBox;

export const isBox = (element: SlotLayoutElement): element is SlotLayoutBox => 'hijos' in element;

export const DEFAULT_LAYOUT: SlotLayoutBox = {
  direccion: 'column',
  gap: 0,
  pad: 0,
  hijos: [
    { direccion: 'row', gap: 6, pad: 0, hijos: [{ slot: 'icon' }, { slot: 'title' }] },
    { slot: 'attrs' },
  ],
};

/** A Group shows no Attributes in its header. */
export const NODE_ONLY_SLOTS: readonly SlotName[] = ['attrs'];

export const DEFAULT_HEADER: SlotLayoutBox = { direccion: 'row', gap: 6, pad: 6, hijos: [{ slot: 'icon' }, { slot: 'title' }] };

/** In visual order, without duplicates. */
export function slotsOf(box: SlotLayoutBox): SlotName[] {
  const seen = new Set<SlotName>();
  const walk = (c: SlotLayoutBox): void => {
    for (const child of c.hijos) {
      if (isBox(child)) walk(child);
      else seen.add(child.slot);
    }
  };
  walk(box);
  return [...seen];
}

/** `undefined`: that of the box containing it. */
export function alignmentOf(box: SlotLayoutBox, slot: SlotName): Alignment | undefined {
  for (const child of box.hijos) {
    if (isBox(child)) {
      const inside = alignmentOf(child, slot);
      if (inside !== undefined) return inside;
    } else if (child.slot === slot) return child.align;
  }
  return undefined;
}

/** In DSL syntax (`column { row gap 6 { icon title } attrs }`), only with the properties that differ from the default. */
export function describeLayout(box: SlotLayoutBox): string {
  const properties = [
    box.gap > 0 ? `gap ${box.gap}` : '',
    box.pad > 0 ? `pad ${box.pad}` : '',
    box.padY !== undefined ? `pad-y ${box.padY}` : '',
    box.anchoMinimo !== undefined ? `min-width ${box.anchoMinimo}` : '',
    box.altoMinimo !== undefined ? `min-height ${box.altoMinimo}` : '',
    box.holgura !== undefined ? `slack ${box.holgura}` : '',
    box.align !== undefined ? `align ${box.align}` : '',
  ].filter((p) => p !== '');
  const children = box.hijos.map((child) => (isBox(child) ? describeLayout(child) : child.align === undefined ? child.slot : `${child.slot} align ${child.align}`));
  return `${[box.direccion, ...properties].join(' ')} { ${children.join(' ')} }`;
}

const optional = <K extends string>(key: K, value: number | string | undefined): Partial<Record<K, number>> =>
  (value === undefined ? {} : { [key]: Number(value) }) as Partial<Record<K, number>>;

const ALIGNMENT: PropertyDefinition = { tipo: 'opcion', valores: ALIGNMENTS, defecto: 'start' };
const BOX_PROPERTIES = {
  gap: { tipo: 'numero', min: 0, max: 64, defecto: 0 },
  pad: { tipo: 'numero', min: 0, max: 64, defecto: 0 },
  'pad-y': { tipo: 'numero', min: 0, max: 64, opcional: true },
  'min-width': { tipo: 'numero', min: 0, max: 1200, opcional: true },
  'min-height': { tipo: 'numero', min: 0, max: 600, opcional: true },
  slack: { tipo: 'numero', min: 0, max: 400, opcional: true },
  align: ALIGNMENT,
} as const satisfies Record<string, PropertyDefinition>;

/** `ref` locates it in the text. */
export interface WrittenProperty<R = unknown> {
  clave: string;
  valor: string | number;
  ref: R;
}

/** Unvalidated input; `ref` comes back in each error to locate it in the text. */
export interface BoxInput<R = unknown> {
  ref: R;
  direccion: string;
  /** `gap`, `pad`, `pad-y`, `min-width`, `min-height`, `slack` and `align`; any other key is an error. */
  props: ReadonlyArray<WrittenProperty<R>>;
  hijos: Array<BoxInput<R> | SlotInput<R>>;
}

export interface SlotInput<R = unknown> {
  ref: R;
  slot: string;
  align?: WrittenProperty<R>;
}

export type LayoutError<R> = CatalogError & { ref: R };

/** Returns all errors at once, each with a suggestion; `disposicion` only if there are no errors. */
export function buildLayout<R>(entry: BoxInput<R>, element: 'nodo' | 'grupo' = 'nodo'): { disposicion?: SlotLayoutBox; errores: Array<LayoutError<R>> } {
  const errors: Array<LayoutError<R>> = [];
  const seen = new Set<string>();
  /** Errors carry the `ref` of the offending property or `backup`. */
  const properties = (article: string, name: string, defined: Record<string, PropertyDefinition>, props: ReadonlyArray<WrittenProperty<R>>, backup: R): Record<string, number | string> => {
    const result = validateProperties({ sujeto: `${article} ${name}`, nombre: name, propiedades: defined }, props, {});
    for (const e of result.errores) errors.push({ ...e, ref: props.find((p) => p.clave === e.clave)?.ref ?? backup });
    return result.propiedades;
  };
  const alignment = (props: Record<string, number | string>, written: ReadonlyArray<WrittenProperty<R>>): Alignment | undefined =>
    written.some((p) => p.clave === 'align') ? (props['align'] as Alignment | undefined) : undefined;
  const box = (c: BoxInput<R>): SlotLayoutBox => {
    if (!(DIRECTIONS as readonly string[]).includes(c.direccion)) {
      errors.push({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Unknown direction '${c.direccion}'; use ${DIRECTIONS.join(' or ')}`, ref: c.ref, ...suggest(c.direccion, DIRECTIONS) });
    }
    const props = properties('The box', `'${c.direccion}'`, BOX_PROPERTIES, c.props, c.ref);
    const children: SlotLayoutElement[] = [];
    for (const h of c.hijos) {
      if (!('slot' in h)) {
        children.push(box(h));
      } else if (!isSlot(h.slot)) {
        errors.push({ codigo: CODES.E_THEME_UNKNOWN_SLOT, mensaje: `Unknown Slot '${h.slot}'; available: ${SLOTS.join(', ')}`, ref: h.ref, ...suggest(h.slot, SLOTS) });
      } else if (element === 'grupo' && NODE_ONLY_SLOTS.includes(h.slot)) {
        errors.push({ codigo: CODES.E_THEME_UNKNOWN_SLOT, mensaje: `Slot '${h.slot}' is not valid in a Group: only in a leaf Node`, ref: h.ref });
      } else if (seen.has(h.slot)) {
        errors.push({ codigo: CODES.E_THEME_UNKNOWN_SLOT, mensaje: `Duplicate Slot '${h.slot}'`, ref: h.ref });
      } else {
        seen.add(h.slot);
        const written = h.align === undefined ? [] : [h.align];
        const a = alignment(properties('The Slot', `'${h.slot}'`, { align: ALIGNMENT }, written, h.ref), written);
        children.push({ slot: h.slot, ...(a !== undefined && { align: a }) });
      }
    }
    const a = alignment(props, c.props);
    return {
      direccion: c.direccion === 'row' ? 'row' : 'column',
      gap: Number(props['gap'] ?? 0),
      pad: Number(props['pad'] ?? 0),
      ...optional('padY', props['pad-y']),
      ...optional('anchoMinimo', props['min-width']),
      ...optional('altoMinimo', props['min-height']),
      ...optional('holgura', props['slack']),
      ...(a !== undefined && { align: a }),
      hijos: children,
    };
  };
  const layout = box(entry);
  return errors.length > 0 ? { errores: errors } : { disposicion: layout, errores: errors };
}
