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
  | { readonly tipo: 'numero'; readonly min: number; readonly max: number; readonly defecto?: number; readonly opcional?: true }
  | { readonly tipo: 'color'; readonly opcional?: true }
  | { readonly tipo: 'opcion'; readonly valores: readonly string[]; readonly defecto?: string; readonly opcional?: true }
  /** Theme component: identifier that starts with an uppercase letter. */
  | { readonly tipo: 'nombre' }
  /** Quoted text of at most `largo` characters. */
  | { readonly tipo: 'texto'; readonly largo: number; readonly opcional?: true };

/** `capa-nodo` is the default; `capa-pagina` only admits the fill Family. */
export type PrimitivePlacement = 'capa-nodo' | 'capa-arista' | 'marcador' | 'etiqueta' | 'texto-slot' | 'capa-pagina';

export interface PrimitiveDefinition {
  readonly familia: 'forma' | 'relleno' | 'borde' | 'trazo' | 'marcador' | 'texto' | 'codigo' | EffectFamily;
  readonly ubicacion?: PrimitivePlacement;
  readonly propiedades: Readonly<Record<string, PropertyDefinition>>;
  readonly afectaMetricas: boolean;
  /** Color properties that cover the box: background against which text contrast is measured. Fill Family only. */
  readonly fondoDeTexto?: readonly string[];
  readonly cajaMinima?: 'cuadrado';
  /** Accepts undeclared properties (parameters of a Theme component), number or text as is. */
  readonly abierta?: true;
}

/** Properties common to every Node or Group Layer: `offset x y` and `grow`. Paint only; no default. */
export const OFFSET_PROPERTIES = {
  'offset-x': { tipo: 'numero', min: -200, max: 200 },
  'offset-y': { tipo: 'numero', min: -200, max: 200 },
  grow: { tipo: 'numero', min: -100, max: 100 },
} as const satisfies Record<string, PropertyDefinition>;

/** `zone` of a Node Layer: `all` (absent), `header` (Slots before `attrs`; without `attrs`, `all`) or `body` (`attrs`). */
export const ZONES = ['all', 'header', 'body'] as const;
export const ZONE_PROPERTY = { zone: { tipo: 'opcion', valores: ZONES, opcional: true } } as const satisfies Record<string, PropertyDefinition>;

export const CATALOG = {
  rect: { familia: 'forma', afectaMetricas: false, propiedades: { radius: { tipo: 'numero', min: 0, max: 100, defecto: 0 } } },
  solid: { familia: 'relleno', afectaMetricas: false, propiedades: { color: { tipo: 'color' } }, fondoDeTexto: ['color'] },
  border: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: { tipo: 'numero', min: 1, max: 16, defecto: 1 } },
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
export const primitivesOfFamily = (family: PrimitiveDefinition['familia']): PrimitiveName[] =>
  (Object.keys(CATALOG) as PrimitiveName[]).filter((name) => definitionOf(name).familia === family);

/** Without a declared `ubicacion`, a Primitive is a Node Layer. */
export type PrimitiveNameAt<U extends PrimitivePlacement> = {
  [K in PrimitiveName]: (typeof CATALOG)[K] extends { readonly ubicacion: infer V } ? (V extends U ? K : never) : U extends 'capa-nodo' ? K : never;
}[PrimitiveName];

export interface SlotDefinition {
  readonly estilo: 'text' | 'icon' | 'chip';
  readonly elastico: boolean;
  /** Single-line text Slot, measured with `slotText`; not derived from the style (`attrs` is `text` and is not one). */
  readonly texto?: true;
  /** Relative to the Theme text size. */
  readonly escala?: number;
  /** Relative to the text size; without it, the header height of the Metrics. */
  readonly interlineado?: number;
}

export const SLOT_DEFINITION = {
  icon: { estilo: 'icon', elastico: false },
  title: { estilo: 'text', elastico: true, texto: true },
  /** The Node kind. */
  badge: { estilo: 'text', elastico: true, texto: true, escala: 0.74, interlineado: 1.25 },
  desc: { estilo: 'text', elastico: true, texto: true, escala: 0.85, interlineado: 1.25 },
  /** The first `source` of the Node. */
  footer: { estilo: 'text', elastico: true, texto: true, escala: 0.75, interlineado: 1.25 },
  attrs: { estilo: 'text', elastico: true },
  /** Children hidden by a Collapsed group. */
  counter: { estilo: 'chip', elastico: false, texto: true, escala: 0.8, interlineado: 1.25 },
} as const satisfies Record<string, SlotDefinition>;
export type SlotName = keyof typeof SLOT_DEFINITION;
export const SLOTS = Object.keys(SLOT_DEFINITION) as SlotName[];
export type TextSlotName = { [S in SlotName]: (typeof SLOT_DEFINITION)[S] extends { readonly texto: true } ? S : never }[SlotName];
export const TEXT_SLOTS = SLOTS.filter((slot): slot is TextSlotName => 'texto' in SLOT_DEFINITION[slot]);

/** Already validated: properties with defaults, colors still as Palette names. */
export interface Primitive {
  tipo: PrimitiveName;
  props: Record<string, number | string>;
}

/** `clave` locates the offending property. */
export interface CatalogError {
  codigo: string;
  mensaje: string;
  clave?: string;
  hint?: string;
  /** Only if there is a single close candidate. */
  candidato?: string;
}

const isPrimitive = (name: string): name is PrimitiveName => Object.hasOwn(CATALOG, name);
const placementOf = (name: PrimitiveName): PrimitivePlacement => definitionOf(name).ubicacion ?? 'capa-nodo';
const validAt = (name: PrimitiveName, placement: PrimitivePlacement): boolean =>
  placement === 'capa-pagina' ? definitionOf(name).familia === 'relleno' : placementOf(name) === placement;
export const primitivesOf = (placement: PrimitivePlacement): string[] =>
  (Object.keys(CATALOG) as PrimitiveName[]).filter((name) => validAt(name, placement));
export const placementsOf = (name: PrimitiveName): PrimitivePlacement[] =>
  validAt(name, 'capa-pagina') ? [placementOf(name), 'capa-pagina'] : [placementOf(name)];
export const isSlot = (name: string): name is SlotName => Object.hasOwn(SLOT_DEFINITION, name);

export const suggest = (written: string, existingOnes: Iterable<string>): { hint?: string; candidato?: string } => {
  const candidates = nearestCandidates(written, existingOnes);
  const [single] = candidates;
  return candidates.length === 0 ? {} : { hint: `did you mean ${candidates.map((c) => `'${c}'`).join(' or ')}`, ...(candidates.length === 1 && single !== undefined && { candidato: single }) };
};

/** Returns every error at once; out of range is an error, never clamped. Values arrive as DSL text. */
export function buildPrimitive(
  kind: string,
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  palette: Readonly<Record<string, string>>,
  placement: PrimitivePlacement = 'capa-nodo',
): { primitiva?: Primitive; errores: CatalogError[] } {
  if (!isPrimitive(kind) || !validAt(kind, placement)) {
    const valid = primitivesOf(placement);
    return {
      errores: [
        {
          codigo: CODES.E_THEME_UNKNOWN_PRIMITIVE,
          mensaje: isPrimitive(kind)
            ? `Primitive '${kind}' is not valid here (it belongs to ${placementsOf(kind).join(' and ')}); available: ${valid.join(', ')}`
            : `Unknown Primitive '${kind}'; available: ${valid.join(', ')}`,
          ...suggest(kind, valid),
        },
      ],
    };
  }
  const base: PrimitiveDefinition = CATALOG[kind];
  const defined = placement === 'capa-nodo' && base.abierta !== true ? { ...base.propiedades, ...OFFSET_PROPERTIES, ...ZONE_PROPERTY } : base.propiedades;
  const { propiedades: properties, errores: errors } = validateProperties({ sujeto: `Primitive '${kind}'`, nombre: `'${kind}'`, propiedades: defined, abierta: base.abierta === true }, props, palette, placement === 'capa-nodo' || placement === 'texto-slot' ? 'nodo' : placement === 'capa-pagina' ? 'pagina' : 'arista');
  return errors.length > 0 ? { errores: errors } : { primitiva: { tipo: kind, props: properties }, errores: errors };
}

export interface PropertySet {
  /** E.g. `Primitive 'rect'`. */
  sujeto: string;
  /** For "'key' of 'rect' must be ...". */
  nombre: string;
  propiedades: Readonly<Record<string, PropertyDefinition>>;
  abierta?: boolean;
}

/** Single rule for ranges, options, colors and defaults, shared by Primitives and Slot boxes. */
export function validateProperties(
  set: PropertySet,
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  palette: Readonly<Record<string, string>>,
  colorContext: 'nodo' | 'arista' | 'pagina' = 'nodo',
): { propiedades: Record<string, number | string>; errores: CatalogError[] } {
  const { sujeto: subject, nombre: name, propiedades: defined } = set;
  const errors: CatalogError[] = [];
  const result: Record<string, number | string> = {};

  for (const { clave: key, valor: value } of props) {
    const property = defined[key];
    if (property === undefined && set.abierta === true) {
      result[key] = typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
    } else if (property === undefined) {
      errors.push({
        codigo: CODES.E_THEME_UNKNOWN_PROPERTY,
        mensaje: `${subject} has no property '${key}'; available: ${Object.keys(defined).join(', ')}`,
        clave: key,
        ...suggest(key, Object.keys(defined)),
      });
    } else if (property.tipo === 'color') {
      const expression = String(value);
      const problems = validateColor(expression, palette, colorContext);
      if (problems.length === 0) result[key] = expression;
      const renames = problems.flatMap((p) => (p.renombre === undefined ? [] : [p.renombre]));
      const candidate = renames.length === 0 ? undefined : renameColor(expression, renames);
      for (const problem of problems) {
        if (problem.renombre !== undefined) {
          // One Issue per expression: its fix already rewrites every old name in it.
          if (problem.renombre === renames[0]) errors.push({ codigo: CODES.E_OLD_CATALOG_VALUE, mensaje: problem.mensaje, clave: key, ...(candidate !== undefined && { candidato: candidate }) });
          continue;
        }
        errors.push({
          codigo: problem.fueraDePaleta === true ? CODES.E_UNKNOWN_PALETTE_COLOR : CODES.E_THEME_INVALID_VALUE,
          mensaje: problem.mensaje,
          clave: key,
          ...(problem.hint !== undefined && { hint: problem.hint }),
        });
      }
    } else if (property.tipo === 'nombre') {
      if (/^[A-Z][A-Za-z0-9_]*$/.test(String(value))) result[key] = String(value);
      else errors.push({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `'${key}' of ${name} must be a Component name (starts with an uppercase letter, e.g. Aurora), not '${value}'`, clave: key });
    } else if (property.tipo === 'texto') {
      const text = String(value);
      if (text.length <= property.largo) result[key] = text;
      else errors.push({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `'${key}' of ${name} must be text of at most ${property.largo} characters, not '${text}'`, clave: key });
    } else if (property.tipo === 'opcion') {
      if (property.valores.includes(String(value))) result[key] = String(value);
      else {
        errors.push({
          codigo: CODES.E_THEME_INVALID_VALUE,
          mensaje: `'${key}' of ${name} must be one of ${property.valores.join(', ')}, not '${value}'`,
          clave: key,
          ...suggest(String(value), property.valores),
        });
      }
    } else {
      const number = typeof value === 'number' ? value : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (Number.isNaN(number) || number < property.min || number > property.max) {
        errors.push({
          codigo: CODES.E_THEME_INVALID_VALUE,
          mensaje: `'${key}' of ${name} must be a number between ${property.min} and ${property.max}, not '${value}'`,
          clave: key,
        });
      } else result[key] = number;
    }
  }

  const given = new Set(props.map((p) => p.clave));
  for (const [key, property] of Object.entries(defined)) {
    if (given.has(key)) continue;
    if (property.tipo === 'numero' && property.defecto === undefined && (property.opcional === true || key in OFFSET_PROPERTIES)) continue;
    if (property.tipo === 'numero' && property.defecto !== undefined) result[key] = property.defecto;
    else if (property.tipo === 'opcion' && property.defecto !== undefined) result[key] = property.defecto;
    else if (property.tipo === 'opcion' && property.opcional === true) continue;
    else if ((property.tipo === 'color' || property.tipo === 'texto') && property.opcional === true) continue;
    else errors.push({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `${subject} requires the property '${key}'`, clave: key });
  }
  return { propiedades: result, errores: errors };
}


/** An undeclared or non-numeric token is an error, never a default value. */
export function resolveTokens(
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  tokens: Readonly<Record<string, string>>,
): { props: Array<{ clave: string; valor: string | number }>; errores: CatalogError[] } {
  const errors: CatalogError[] = [];
  const resolved: Array<{ clave: string; valor: string | number }> = [];
  for (const { clave: key, valor: value } of props) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      resolved.push({ clave: key, valor: value });
      continue;
    }
    const name = value.slice(1);
    if (!Object.hasOwn(tokens, name)) {
      errors.push({
        codigo: CODES.E_THEME_UNKNOWN_TOKEN,
        mensaje: `Token '${value}' is not declared in the Theme's 'tokens'`,
        clave: key,
        ...suggest(name, Object.keys(tokens)),
      });
      continue;
    }
    const number = Number(tokens[name]);
    if (Number.isFinite(number)) resolved.push({ clave: key, valor: number });
    else errors.push({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Token '${value}' is not a number ('${tokens[name]}')`, clave: key });
  }
  return { props: resolved, errores: errors };
}

/** An old (Spanish) name of `category` is the `old-catalog-value` error with the new one as `candidato` (the `fix`); `undefined` otherwise. */
export function oldValueError(category: CatalogCategory, written: string): CatalogError | undefined {
  const renamed = oldRename(OLD_CATALOG_VALUES, category, written);
  if (renamed === undefined) return undefined;
  return { codigo: CODES.E_OLD_CATALOG_VALUE, mensaje: oldValueMessage(category, written, renamed), candidato: renamed };
}
