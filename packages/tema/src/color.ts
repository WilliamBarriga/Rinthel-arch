/**
 * Colores del Tema: siempre nombres de Paleta. Expresiones: `ink`, `ink/0.15` (alfa), `mix(a, b, 0.3)`, y los
 * especiales `COLOR` (color del Tipo de nodo) y `ORIGIN` (color del Nodo de origen de una Arista).
 */
import { OLD_CATALOG_VALUES, nearestCandidates, oldValueMessage, oldRename } from 'canonical';

type Base = { tipo: 'paleta'; nombre: string } | { tipo: 'especial'; nombre: 'COLOR' | 'ORIGIN' } | { tipo: 'mix'; a: string; b: string; t: number };
interface Expresion {
  base: Base;
  alfa?: number;
}

export interface ErrorDeColor {
  mensaje: string;
  /** Este error lleva codigo propio. */
  fueraDePaleta?: boolean;
  hint?: string;
  /** An old name (a built-in Palette color or `ORIGEN`): the error is `old-catalog-value` and its fix rewrites it. */
  renombre?: { antiguo: string; nuevo: string };
}

export interface ContextoDeColor {
  color?: string;
  origen?: string;
  /** Si esta, `COLOR` se resuelve a `var(<variable>)` (con alfa, a un `color-mix`) y no a un valor. */
  variable?: string;
}

const NUMERO = /^(?:\d+\.?\d*|\.\d+)$/;

const esEspecial = (nombre: string): nombre is 'COLOR' | 'ORIGIN' => nombre === 'COLOR' || nombre === 'ORIGIN';

function leer(texto: string): Expresion | undefined {
  const partido = /^(.*?)(?:\/(\d*\.?\d+))?$/.exec(texto.trim());
  const cuerpo = partido?.[1]?.trim() ?? '';
  const alfa = partido?.[2] === undefined ? undefined : Number(partido[2]);
  const mezcla = /^mix\(\s*([^,\s()]+)\s*,\s*([^,\s()]+)\s*,\s*([^,\s()]+)\s*\)$/.exec(cuerpo);
  if (mezcla !== null) {
    const t = mezcla[3] as string;
    if (!NUMERO.test(t)) return undefined;
    return { base: { tipo: 'mix', a: mezcla[1] as string, b: mezcla[2] as string, t: Number(t) }, ...(alfa !== undefined && { alfa }) };
  }
  if (!/^[A-Za-z_][-\w]*$/.test(cuerpo)) return undefined;
  const base: Base = cuerpo === 'COLOR' || cuerpo === 'ORIGIN' ? { tipo: 'especial', nombre: cuerpo } : { tipo: 'paleta', nombre: cuerpo };
  return { base, ...(alfa !== undefined && { alfa }) };
}

const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string } => {
  const candidatos = nearestCandidates(escrito, existentes);
  return candidatos.length === 0 ? {} : { hint: `did you mean ${candidatos.map((c) => `'${c}'`).join(' or ')}` };
};

/**
 * The new name of an old color name: `ORIGEN` always, a built-in Palette color only if the Palette has the new name
 * (a user Palette that declares its own `fondo` is untouched).
 */
function nombreNuevo(nombre: string, paleta: Readonly<Record<string, string>>): { categoria: 'color' | 'palette'; nombre: string } | undefined {
  const especial = oldRename(OLD_CATALOG_VALUES, 'color', nombre);
  if (especial !== undefined) return { categoria: 'color', nombre: especial };
  const dePaleta = oldRename(OLD_CATALOG_VALUES, 'palette', nombre);
  return dePaleta !== undefined && Object.hasOwn(paleta, dePaleta) ? { categoria: 'palette', nombre: dePaleta } : undefined;
}

/** `texto` with every whole-word old name replaced by its new one: the fix of a color expression. */
export const renombrarColor = (texto: string, renombres: ReadonlyArray<{ antiguo: string; nuevo: string }>): string =>
  renombres.reduce((hecho, { antiguo, nuevo }) => hecho.replace(new RegExp(String.raw`(?<![-\w])${antiguo}(?![-\w])`, 'g'), nuevo), texto);

export function hexARgb(hex: string): [number, number, number] | undefined {
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (corto !== null) return [1, 2, 3].map((i) => Number.parseInt((corto[i] as string).repeat(2), 16)) as [number, number, number];
  const largo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (largo === null) return undefined;
  return [1, 2, 3].map((i) => Number.parseInt(largo[i] as string, 16)) as [number, number, number];
}

/** Devuelve todos los problemas; `ORIGIN` solo vale con `ambito` `arista`. */
export function validarColor(texto: string, paleta: Readonly<Record<string, string>>, ambito: 'nodo' | 'arista' | 'pagina' = 'nodo'): ErrorDeColor[] {
  const expresion = leer(texto);
  if (expresion === undefined) return [{ mensaje: `'${texto}' is not a valid color expression (name, name/alpha or mix(a, b, t))` }];
  const errores: ErrorDeColor[] = [];
  const necesitaHex = expresion.alfa !== undefined || expresion.base.tipo === 'mix';
  const comprobar = (nombre: string): void => {
    const nuevo = Object.hasOwn(paleta, nombre) ? undefined : nombreNuevo(nombre, paleta);
    if (nuevo !== undefined) {
      errores.push({ mensaje: oldValueMessage(nuevo.categoria, nombre, nuevo.nombre), renombre: { antiguo: nombre, nuevo: nuevo.nombre } });
    } else if (!Object.hasOwn(paleta, nombre)) {
      errores.push({ mensaje: `Color '${nombre}' is not a Palette name of the Theme`, fueraDePaleta: true, ...sugerir(nombre, Object.keys(paleta)) });
    } else if (necesitaHex && hexARgb(paleta[nombre] as string) === undefined) {
      errores.push({ mensaje: `Palette color '${nombre}' is not a hex (#rgb or #rrggbb); alpha and mix need one` });
    }
  };
  const especial = (nombre: 'COLOR' | 'ORIGIN'): void => {
    if (nombre === 'ORIGIN' && ambito !== 'arista') errores.push({ mensaje: "'ORIGIN' is only valid on Edges (it is the color of the source Node)" });
    else if (nombre === 'COLOR' && ambito === 'pagina') errores.push({ mensaje: "'COLOR' is not valid on the page (it is the Node kind color); use a Palette name" });
  };
  const operando = (nombre: string): void => (esEspecial(nombre) ? especial(nombre) : comprobar(nombre));
  const { base, alfa } = expresion;
  if (base.tipo === 'paleta') comprobar(base.nombre);
  else if (base.tipo === 'mix') {
    operando(base.a);
    operando(base.b);
    if (base.t < 0 || base.t > 1) errores.push({ mensaje: `The mix factor must be between 0 and 1, not ${base.t}` });
  } else especial(base.nombre);
  if (alfa !== undefined && (alfa < 0 || alfa > 1)) errores.push({ mensaje: `The alpha must be between 0 and 1, not ${alfa}` });
  return errores;
}

const aHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Hex de la Paleta tal cual, `#rrggbb` para un `mix` y `rgba(r, g, b, a)` con alfa; una expresion invalida se devuelve sin cambios. */
export function resolverColor(texto: string, paleta: Readonly<Record<string, string>>, contexto: ContextoDeColor = {}): string {
  const expresion = leer(texto);
  if (expresion === undefined) return texto;
  const { base, alfa } = expresion;
  if (base.tipo === 'especial' && base.nombre === 'COLOR' && contexto.variable !== undefined) {
    const variable = `var(${contexto.variable})`;
    return alfa === undefined ? variable : `color-mix(in srgb, ${variable} ${Math.round(alfa * 10000) / 100}%, transparent)`;
  }
  const dePaleta = (nombre: string): string | undefined => (nombre === 'COLOR' ? contexto.color : nombre === 'ORIGIN' ? contexto.origen : nombre);
  let valor: string;
  if (base.tipo === 'mix' && contexto.variable !== undefined && (base.a === 'COLOR' || base.b === 'COLOR')) {
    // Con `COLOR` mezcla el navegador; `t` es la parte de `b`, como en la mezcla con hex.
    const operando = (nombre: string): string => (nombre === 'COLOR' ? `var(${contexto.variable})` : (paleta[dePaleta(nombre) ?? ''] ?? nombre));
    const mezcla = `color-mix(in srgb, ${operando(base.a)} ${Math.round((1 - base.t) * 10000) / 100}%, ${operando(base.b)})`;
    return alfa === undefined ? mezcla : `color-mix(in srgb, ${mezcla} ${Math.round(alfa * 10000) / 100}%, transparent)`;
  }
  if (base.tipo === 'mix') {
    const a = hexARgb(paleta[dePaleta(base.a) ?? ''] ?? '');
    const b = hexARgb(paleta[dePaleta(base.b) ?? ''] ?? '');
    valor = a === undefined || b === undefined ? texto : aHex(a.map((c, i) => c + ((b[i] as number) - c) * base.t));
  } else {
    const nombre = dePaleta(base.nombre);
    valor = (nombre === undefined ? undefined : paleta[nombre]) ?? texto;
  }
  if (alfa === undefined) return valor;
  const rgb = hexARgb(valor);
  return rgb === undefined ? valor : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alfa})`;
}
