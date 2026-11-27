/** Catalog of Primitives and Slots: single source of validation, messages and the generated reference. */
import { CODES, OLD_CATALOG_VALUES, nearestCandidates, oldValueMessage, oldRename } from 'canonical';
import type { CatalogCategory } from 'canonical';

import { EFFECT_CATALOG } from './effect-catalog';
import type { EffectFamily } from './effect-catalog';
import { renameColor, validateColor } from './color';
import { BORDERS } from './families/border';
import { CODE } from './families/code';
import { SHAPES } from './families/shape';
import { MARKERS } from './families/marker';
import { FILLS } from './families/fill';
import { TEXTS } from './families/text';
import { STROKES } from './families/stroke';

export type PropertyDefinition =
  | { readonly type: 'number'; readonly min: number; readonly max: number; readonly default?: number; readonly optional?: true }
  | { readonly type: 'color'; readonly optional?: true }
  | { readonly type: 'option'; readonly values: readonly string[]; readonly default?: string; readonly optional?: true }
  /** Theme component: identifier that starts with an uppercase letter. */
  | { readonly type: 'name' }
  /** Quoted text of at most `maxLength` characters. */
  | { readonly type: 'text'; readonly maxLength: number; readonly optional?: true };

/** `capa-nodo` is the default; `capa-pagina` only admits the fill Family. */
export type PrimitivePlacement = 'capa-nodo' | 'capa-arista' | 'marcador' | 'etiqueta' | 'texto-slot' | 'capa-pagina';

export interface PrimitiveDefinition {
  readonly family: 'forma' | 'relleno' | 'borde' | 'trazo' | 'marcador' | 'texto' | 'codigo' | EffectFamily;
  readonly placement?: PrimitivePlacement;
  readonly properties: Readonly<Record<string, PropertyDefinition>>;
  readonly affectsMetrics: boolean;
  /** Color properties that cover the box: background against which text contrast is measured. Fill Family only. */
  readonly textBackground?: readonly string[];
  readonly minimumBox?: 'square';
  /** Accepts undeclared properties (parameters of a Theme component), number or text as is. */
  readonly open?: true;
}

/** Properties common to every Node or Group Layer: `offset x y` and `grow`. Paint only; no default. */
export const OFFSET_PROPERTIES = {
  'offset-x': { type: 'number', min: -200, max: 200 },
  'offset-y': { type: 'number', min: -200, max: 200 },
  grow: { type: 'number', min: -100, max: 100 },
} as const satisfies Record<string, PropertyDefinition>;

/** `zone` of a Node Layer: `all` (absent), `header` (Slots before `attrs`; without `attrs`, `all`) or `body` (`attrs`). */
export const ZONES = ['all', 'header', 'body'] as const;
export const ZONE_PROPERTY = { zone: { type: 'option', values: ZONES, optional: true } } as const satisfies Record<string, PropertyDefinition>;

export const CATALOG = {
  rect: { family: 'forma', affectsMetrics: false, properties: { radius: { type: 'number', min: 0, max: 100, default: 0 } } },
  solid: { family: 'relleno', affectsMetrics: false, properties: { color: { type: 'color' } }, textBackground: ['color'] },
  border: {
    family: 'borde',
    affectsMetrics: false,
    properties: { color: { type: 'color' }, width: { type: 'number', min: 1, max: 16, default: 1 } },
  },
  ...SHAPES,
  ...FILLS,
  ...BORDERS,
  ...EFFECT_CATALOG,
  ...STROKES,
  ...MARKERS,
  ...TEXTS,
  ...CODE,
} as const satisfies Record<string, PrimitiveDefinition>;

export type PrimitiveName = keyof typeof CATALOG;

/** With the wide type: the catalog literal loses the optional keys. */
export const definitionOf = (name: PrimitiveName): PrimitiveDefinition => CATALOG[name];

/** In catalog order. */
export const primitivesOfFamily = (family: PrimitiveDefinition['family']): PrimitiveName[] =>
  (Object.keys(CATALOG) as PrimitiveName[]).filter((name) => definitionOf(name).family === family);

/** Without a declared `placement`, a Primitive is a Node Layer. */
export type PrimitiveNameAt<U extends PrimitivePlacement> = {
  [K in PrimitiveName]: (typeof CATALOG)[K] extends { readonly placement: infer V } ? (V extends U ? K : never) : U extends 'capa-nodo' ? K : never;
}[PrimitiveName];

export interface SlotDefinition {
  readonly style: 'text' | 'icon' | 'chip';
  readonly elastic: boolean;
  /** Single-line text Slot, measured with `slotText`; not derived from the style (`attrs` is `text` and is not one). */
  readonly text?: true;
  /** Relative to the Theme text size. */
  readonly scale?: number;
  /** Relative to the text size; without it, the header height of the Metrics. */
  readonly lineHeight?: number;
}

export const SLOT_DEFINITION = {
  icon: { style: 'icon', elastic: false },
  title: { style: 'text', elastic: true, text: true },
  /** The Node kind. */
  badge: { style: 'text', elastic: true, text: true, scale: 0.74, lineHeight: 1.25 },
  desc: { style: 'text', elastic: true, text: true, scale: 0.85, lineHeight: 1.25 },
  /** The first `source` of the Node. */
  footer: { style: 'text', elastic: true, text: true, scale: 0.75, lineHeight: 1.25 },
  attrs: { style: 'text', elastic: true },
  /** Children hidden by a Collapsed group. */
  counter: { style: 'chip', elastic: false, text: true, scale: 0.8, lineHeight: 1.25 },
} as const satisfies Record<string, SlotDefinition>;
export type SlotName = keyof typeof SLOT_DEFINITION;
export const SLOTS = Object.keys(SLOT_DEFINITION) as SlotName[];
export type TextSlotName = { [S in SlotName]: (typeof SLOT_DEFINITION)[S] extends { readonly text: true } ? S : never }[SlotName];
export const TEXT_SLOTS = SLOTS.filter((slot): slot is TextSlotName => 'text' in SLOT_DEFINITION[slot]);

/** Already validated: properties with defaults, colors still as Palette names. */
export interface Primitive {
  tipo: PrimitiveName;
  props: Record<string, number | string>;
}

/** `key` locates the offending property. */
export interface CatalogError {
  code: string;
  message: string;
  key?: string;
  hint?: string;
  /** Only if there is a single close candidate. */
  candidate?: string;
}

const isPrimitive = (name: string): name is PrimitiveName => Object.hasOwn(CATALOG, name);
const placementOf = (name: PrimitiveName): PrimitivePlacement => definitionOf(name).placement ?? 'capa-nodo';
const validAt = (name: PrimitiveName, placement: PrimitivePlacement): boolean =>
  placement === 'capa-pagina' ? definitionOf(name).family === 'relleno' : placementOf(name) === placement;
export const primitivesOf = (placement: PrimitivePlacement): string[] =>
  (Object.keys(CATALOG) as PrimitiveName[]).filter((name) => validAt(name, placement));
export const placementsOf = (name: PrimitiveName): PrimitivePlacement[] =>
  validAt(name, 'capa-pagina') ? [placementOf(name), 'capa-pagina'] : [placementOf(name)];
export const isSlot = (name: string): name is SlotName => Object.hasOwn(SLOT_DEFINITION, name);

export const suggest = (written: string, known: Iterable<string>): { hint?: string; candidate?: string } => {
  const candidates = nearestCandidates(written, known);
  const [single] = candidates;
  return candidates.length === 0 ? {} : { hint: `did you mean ${candidates.map((c) => `'${c}'`).join(' or ')}`, ...(candidates.length === 1 && single !== undefined && { candidate: single }) };
};

/** Returns every error at once; out of range is an error, never clamped. Values arrive as DSL text. */
export function buildPrimitive(
  kind: string,
  props: ReadonlyArray<{ key: string; value: string | number }>,
  palette: Readonly<Record<string, string>>,
  placement: PrimitivePlacement = 'capa-nodo',
): { primitive?: Primitive; errors: CatalogError[] } {
  if (!isPrimitive(kind) || !validAt(kind, placement)) {
    const valid = primitivesOf(placement);
    return {
      errors: [
        {
          code: CODES.E_THEME_UNKNOWN_PRIMITIVE,
          message: isPrimitive(kind)
            ? `Primitive '${kind}' is not valid here (it belongs to ${placementsOf(kind).join(' and ')}); available: ${valid.join(', ')}`
            : `Unknown Primitive '${kind}'; available: ${valid.join(', ')}`,
          ...suggest(kind, valid),
        },
      ],
    };
  }
  const base: PrimitiveDefinition = CATALOG[kind];
  const defined = placement === 'capa-nodo' && base.open !== true ? { ...base.properties, ...OFFSET_PROPERTIES, ...ZONE_PROPERTY } : base.properties;
  const { properties, errors } = validateProperties({ subject: `Primitive '${kind}'`, name: `'${kind}'`, properties: defined, open: base.open === true }, props, palette, placement === 'capa-nodo' || placement === 'texto-slot' ? 'nodo' : placement === 'capa-pagina' ? 'pagina' : 'arista');
  return errors.length > 0 ? { errors } : { primitive: { tipo: kind, props: properties }, errors };
}

export interface PropertySet {
  /** E.g. `Primitive 'rect'`. */
  subject: string;
  /** For "'key' of 'rect' must be ...". */
  name: string;
  properties: Readonly<Record<string, PropertyDefinition>>;
  open?: boolean;
}

/** Single rule for ranges, options, colors and defaults, shared by Primitives and Slot boxes. */
export function validateProperties(
  set: PropertySet,
  props: ReadonlyArray<{ key: string; value: string | number }>,
  palette: Readonly<Record<string, string>>,
  colorContext: 'nodo' | 'arista' | 'pagina' = 'nodo',
): { properties: Record<string, number | string>; errors: CatalogError[] } {
  const { subject, name, properties: defined } = set;
  const errors: CatalogError[] = [];
  const result: Record<string, number | string> = {};

  for (const { key, value } of props) {
    const property = defined[key];
    if (property === undefined && set.open === true) {
      result[key] = typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
    } else if (property === undefined) {
      errors.push({
        code: CODES.E_THEME_UNKNOWN_PROPERTY,
        message: `${subject} has no property '${key}'; available: ${Object.keys(defined).join(', ')}`,
        key: key,
        ...suggest(key, Object.keys(defined)),
      });
    } else if (property.type === 'color') {
      const expression = String(value);
      const problems = validateColor(expression, palette, colorContext);
      if (problems.length === 0) result[key] = expression;
      const renames = problems.flatMap((p) => (p.renombre === undefined ? [] : [p.renombre]));
      const candidate = renames.length === 0 ? undefined : renameColor(expression, renames);
      for (const problem of problems) {
        if (problem.renombre !== undefined) {
          // One Issue per expression: its fix already rewrites every old name in it.
          if (problem.renombre === renames[0]) errors.push({ code: CODES.E_OLD_CATALOG_VALUE, message: problem.mensaje, key, ...(candidate !== undefined && { candidate }) });
          continue;
        }
        errors.push({
          code: problem.fueraDePaleta === true ? CODES.E_UNKNOWN_PALETTE_COLOR : CODES.E_THEME_INVALID_VALUE,
          message: problem.mensaje,
          key: key,
          ...(problem.hint !== undefined && { hint: problem.hint }),
        });
      }
    } else if (property.type === 'name') {
      if (/^[A-Z][A-Za-z0-9_]*$/.test(String(value))) result[key] = String(value);
      else errors.push({ code: CODES.E_THEME_INVALID_VALUE, message: `'${key}' of ${name} must be a Component name (starts with an uppercase letter, e.g. Aurora), not '${value}'`, key });
    } else if (property.type === 'text') {
      const text = String(value);
      if (text.length <= property.maxLength) result[key] = text;
      else errors.push({ code: CODES.E_THEME_INVALID_VALUE, message: `'${key}' of ${name} must be text of at most ${property.maxLength} characters, not '${text}'`, key });
    } else if (property.type === 'option') {
      if (property.values.includes(String(value))) result[key] = String(value);
      else {
        errors.push({
          code: CODES.E_THEME_INVALID_VALUE,
          message: `'${key}' of ${name} must be one of ${property.values.join(', ')}, not '${value}'`,
          key: key,
          ...suggest(String(value), property.values),
        });
      }
    } else {
      const number = typeof value === 'number' ? value : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (Number.isNaN(number) || number < property.min || number > property.max) {
        errors.push({
          code: CODES.E_THEME_INVALID_VALUE,
          message: `'${key}' of ${name} must be a number between ${property.min} and ${property.max}, not '${value}'`,
          key: key,
        });
      } else result[key] = number;
    }
  }

  const given = new Set(props.map((p) => p.key));
  for (const [key, property] of Object.entries(defined)) {
    if (given.has(key)) continue;
    if (property.type === 'number' && property.default === undefined && (property.optional === true || key in OFFSET_PROPERTIES)) continue;
    if (property.type === 'number' && property.default !== undefined) result[key] = property.default;
    else if (property.type === 'option' && property.default !== undefined) result[key] = property.default;
    else if (property.type === 'option' && property.optional === true) continue;
    else if ((property.type === 'color' || property.type === 'text') && property.optional === true) continue;
    else errors.push({ code: CODES.E_THEME_INVALID_VALUE, message: `${subject} requires the property '${key}'`, key });
  }
  return { properties: result, errors };
}


/** An undeclared or non-numeric token is an error, never a default value. */
export function resolveTokens(
  props: ReadonlyArray<{ key: string; value: string | number }>,
  tokens: Readonly<Record<string, string>>,
): { props: Array<{ key: string; value: string | number }>; errors: CatalogError[] } {
  const errors: CatalogError[] = [];
  const resolved: Array<{ key: string; value: string | number }> = [];
  for (const { key, value } of props) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      resolved.push({ key, value });
      continue;
    }
    const name = value.slice(1);
    if (!Object.hasOwn(tokens, name)) {
      errors.push({
        code: CODES.E_THEME_UNKNOWN_TOKEN,
        message: `Token '${value}' is not declared in the Theme's 'tokens'`,
        key: key,
        ...suggest(name, Object.keys(tokens)),
      });
      continue;
    }
    const number = Number(tokens[name]);
    if (Number.isFinite(number)) resolved.push({ key, value: number });
    else errors.push({ code: CODES.E_THEME_INVALID_VALUE, message: `Token '${value}' is not a number ('${tokens[name]}')`, key });
  }
  return { props: resolved, errors };
}

/** An old (Spanish) name of `category` is the `old-catalog-value` error with the new one as `candidate` (the `fix`); `undefined` otherwise. */
export function oldValueError(category: CatalogCategory, written: string): CatalogError | undefined {
  const newName = oldRename(OLD_CATALOG_VALUES, category, written);
  if (newName === undefined) return undefined;
  return { code: CODES.E_OLD_CATALOG_VALUE, message: oldValueMessage(category, written, newName), candidate: newName };
}
