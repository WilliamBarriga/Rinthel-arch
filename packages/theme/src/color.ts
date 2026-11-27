/**
 * Theme colors: always Palette names. Expressions: `ink`, `ink/0.15` (alpha), `mix(a, b, 0.3)`, and the
 * specials `COLOR` (Node kind color) and `ORIGIN` (color of the source Node of an Edge).
 */
import { OLD_CATALOG_VALUES, nearestCandidates, oldValueMessage, oldRename } from 'canonical';

type Base = { tipo: 'paleta'; nombre: string } | { tipo: 'especial'; nombre: 'COLOR' | 'ORIGIN' } | { tipo: 'mix'; a: string; b: string; t: number };
interface Expression {
  base: Base;
  alfa?: number;
}

export interface ColorError {
  mensaje: string;
  /** This error carries its own code. */
  fueraDePaleta?: boolean;
  hint?: string;
  /** An old name (a built-in Palette color or `ORIGEN`): the error is `old-catalog-value` and its fix rewrites it. */
  renombre?: { antiguo: string; nuevo: string };
}

export interface ColorContext {
  color?: string;
  origen?: string;
  /** If present, `COLOR` resolves to `var(<variable>)` (with alpha, to a `color-mix`) instead of a value. */
  variable?: string;
}

const NUMBER = /^(?:\d+\.?\d*|\.\d+)$/;

const isSpecial = (name: string): name is 'COLOR' | 'ORIGIN' => name === 'COLOR' || name === 'ORIGIN';

function read(text: string): Expression | undefined {
  const split = /^(.*?)(?:\/(\d*\.?\d+))?$/.exec(text.trim());
  const body = split?.[1]?.trim() ?? '';
  const alpha = split?.[2] === undefined ? undefined : Number(split[2]);
  const mix = /^mix\(\s*([^,\s()]+)\s*,\s*([^,\s()]+)\s*,\s*([^,\s()]+)\s*\)$/.exec(body);
  if (mix !== null) {
    const t = mix[3] as string;
    if (!NUMBER.test(t)) return undefined;
    return { base: { tipo: 'mix', a: mix[1] as string, b: mix[2] as string, t: Number(t) }, ...(alpha !== undefined && { alfa: alpha }) };
  }
  if (!/^[A-Za-z_][-\w]*$/.test(body)) return undefined;
  const base: Base = body === 'COLOR' || body === 'ORIGIN' ? { tipo: 'especial', nombre: body } : { tipo: 'paleta', nombre: body };
  return { base, ...(alpha !== undefined && { alfa: alpha }) };
}

const suggest = (written: string, known: Iterable<string>): { hint?: string } => {
  const candidates = nearestCandidates(written, known);
  return candidates.length === 0 ? {} : { hint: `did you mean ${candidates.map((c) => `'${c}'`).join(' or ')}` };
};

/**
 * The new name of an old color name: `ORIGEN` always, a built-in Palette color only if the Palette has the new name
 * (a user Palette that declares its own `fondo` is untouched).
 */
function newName(name: string, palette: Readonly<Record<string, string>>): { categoria: 'color' | 'palette'; nombre: string } | undefined {
  const special = oldRename(OLD_CATALOG_VALUES, 'color', name);
  if (special !== undefined) return { categoria: 'color', nombre: special };
  const fromPalette = oldRename(OLD_CATALOG_VALUES, 'palette', name);
  return fromPalette !== undefined && Object.hasOwn(palette, fromPalette) ? { categoria: 'palette', nombre: fromPalette } : undefined;
}

/** `text` with every whole-word old name replaced by its new one: the fix of a color expression. */
export const renameColor = (text: string, renames: ReadonlyArray<{ antiguo: string; nuevo: string }>): string =>
  renames.reduce((done, { antiguo: old, nuevo: suggestion }) => done.replace(new RegExp(String.raw`(?<![-\w])${old}(?![-\w])`, 'g'), suggestion), text);

export function hexToRgb(hex: string): [number, number, number] | undefined {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short !== null) return [1, 2, 3].map((i) => Number.parseInt((short[i] as string).repeat(2), 16)) as [number, number, number];
  const length = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (length === null) return undefined;
  return [1, 2, 3].map((i) => Number.parseInt(length[i] as string, 16)) as [number, number, number];
}

/** Returns every problem; `ORIGIN` is only valid with `scope` `arista`. */
export function validateColor(text: string, palette: Readonly<Record<string, string>>, scope: 'nodo' | 'arista' | 'pagina' = 'nodo'): ColorError[] {
  const expression = read(text);
  if (expression === undefined) return [{ mensaje: `'${text}' is not a valid color expression (name, name/alpha or mix(a, b, t))` }];
  const errors: ColorError[] = [];
  const needsHex = expression.alfa !== undefined || expression.base.tipo === 'mix';
  const check = (name: string): void => {
    const suggestion = Object.hasOwn(palette, name) ? undefined : newName(name, palette);
    if (suggestion !== undefined) {
      errors.push({ mensaje: oldValueMessage(suggestion.categoria, name, suggestion.nombre), renombre: { antiguo: name, nuevo: suggestion.nombre } });
    } else if (!Object.hasOwn(palette, name)) {
      errors.push({ mensaje: `Color '${name}' is not a Palette name of the Theme`, fueraDePaleta: true, ...suggest(name, Object.keys(palette)) });
    } else if (needsHex && hexToRgb(palette[name] as string) === undefined) {
      errors.push({ mensaje: `Palette color '${name}' is not a hex (#rgb or #rrggbb); alpha and mix need one` });
    }
  };
  const special = (name: 'COLOR' | 'ORIGIN'): void => {
    if (name === 'ORIGIN' && scope !== 'arista') errors.push({ mensaje: "'ORIGIN' is only valid on Edges (it is the color of the source Node)" });
    else if (name === 'COLOR' && scope === 'pagina') errors.push({ mensaje: "'COLOR' is not valid on the page (it is the Node kind color); use a Palette name" });
  };
  const operand = (name: string): void => (isSpecial(name) ? special(name) : check(name));
  const { base, alfa: alpha } = expression;
  if (base.tipo === 'paleta') check(base.nombre);
  else if (base.tipo === 'mix') {
    operand(base.a);
    operand(base.b);
    if (base.t < 0 || base.t > 1) errors.push({ mensaje: `The mix factor must be between 0 and 1, not ${base.t}` });
  } else special(base.nombre);
  if (alpha !== undefined && (alpha < 0 || alpha > 1)) errors.push({ mensaje: `The alpha must be between 0 and 1, not ${alpha}` });
  return errors;
}

const toHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** The Palette hex as is, `#rrggbb` for a `mix` and `rgba(r, g, b, a)` with alpha; an invalid expression is returned unchanged. */
export function resolveColor(text: string, palette: Readonly<Record<string, string>>, context: ColorContext = {}): string {
  const expression = read(text);
  if (expression === undefined) return text;
  const { base, alfa: alpha } = expression;
  if (base.tipo === 'especial' && base.nombre === 'COLOR' && context.variable !== undefined) {
    const variable = `var(${context.variable})`;
    return alpha === undefined ? variable : `color-mix(in srgb, ${variable} ${Math.round(alpha * 10000) / 100}%, transparent)`;
  }
  const fromPalette = (name: string): string | undefined => (name === 'COLOR' ? context.color : name === 'ORIGIN' ? context.origen : name);
  let value: string;
  if (base.tipo === 'mix' && context.variable !== undefined && (base.a === 'COLOR' || base.b === 'COLOR')) {
    // With `COLOR` the browser mixes; `t` is the share of `b`, as in the hex mix.
    const operand = (name: string): string => (name === 'COLOR' ? `var(${context.variable})` : (palette[fromPalette(name) ?? ''] ?? name));
    const mix = `color-mix(in srgb, ${operand(base.a)} ${Math.round((1 - base.t) * 10000) / 100}%, ${operand(base.b)})`;
    return alpha === undefined ? mix : `color-mix(in srgb, ${mix} ${Math.round(alpha * 10000) / 100}%, transparent)`;
  }
  if (base.tipo === 'mix') {
    const a = hexToRgb(palette[fromPalette(base.a) ?? ''] ?? '');
    const b = hexToRgb(palette[fromPalette(base.b) ?? ''] ?? '');
    value = a === undefined || b === undefined ? text : toHex(a.map((c, i) => c + ((b[i] as number) - c) * base.t));
  } else {
    const name = fromPalette(base.nombre);
    value = (name === undefined ? undefined : palette[name]) ?? text;
  }
  if (alpha === undefined) return value;
  const rgb = hexToRgb(value);
  return rgb === undefined ? value : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
