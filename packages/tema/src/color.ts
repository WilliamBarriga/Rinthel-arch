/**
 * Colores del Tema (ADR 0008): siempre un nombre de Paleta, con modificadores.
 * Expresiones: `ink`, `ink/0.15` (alfa), `mix(a, b, 0.3)` (mezcla de dos
 * colores de Paleta, o de `COLOR`/`ORIGEN`: `mix(COLOR, ink, 0.3)`), y los
 * especiales `COLOR` (color del Tipo de nodo) y `ORIGEN` (color del Nodo de
 * origen de una Arista), con alfa opcional.
 * Un hex nunca aparece fuera de `palette`. Puro y determinista.
 */
import { candidatosCercanos } from 'canonico';

type Base = { tipo: 'paleta'; nombre: string } | { tipo: 'especial'; nombre: 'COLOR' | 'ORIGEN' } | { tipo: 'mix'; a: string; b: string; t: number };
interface Expresion {
  base: Base;
  alfa?: number;
}

export interface ErrorDeColor {
  mensaje: string;
  /** `true` si el culpable es un nombre que no esta en la Paleta (codigo propio). */
  fueraDePaleta?: boolean;
  hint?: string;
}

/** Lo que `COLOR` y `ORIGEN` significan al resolver. */
export interface ContextoDeColor {
  /** Nombre de Paleta del color del Tipo de nodo. */
  color?: string;
  /** Nombre de Paleta del color del Nodo de origen (solo en Aristas). */
  origen?: string;
  /**
   * Variable CSS que el dibujo fija por elemento con su color: `COLOR` se resuelve a `var(<variable>)`
   * (con alfa, a un `color-mix`) en vez de a un valor, y una misma hoja sirve a todos los colores.
   */
  variable?: string;
}

const NUMERO = /^(?:\d+\.?\d*|\.\d+)$/;

const esEspecial = (nombre: string): nombre is 'COLOR' | 'ORIGEN' => nombre === 'COLOR' || nombre === 'ORIGEN';

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
  const base: Base = cuerpo === 'COLOR' || cuerpo === 'ORIGEN' ? { tipo: 'especial', nombre: cuerpo } : { tipo: 'paleta', nombre: cuerpo };
  return { base, ...(alfa !== undefined && { alfa }) };
}

const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string } => {
  const candidatos = candidatosCercanos(escrito, existentes);
  return candidatos.length === 0 ? {} : { hint: `quisiste decir ${candidatos.map((c) => `'${c}'`).join(' o ')}` };
};

export function hexARgb(hex: string): [number, number, number] | undefined {
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (corto !== null) return [1, 2, 3].map((i) => Number.parseInt((corto[i] as string).repeat(2), 16)) as [number, number, number];
  const largo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (largo === null) return undefined;
  return [1, 2, 3].map((i) => Number.parseInt(largo[i] as string, 16)) as [number, number, number];
}

/**
 * Comprueba una expresion de color contra la Paleta del Tema. `ambito` decide si
 * `ORIGEN` es valido (solo en Aristas). Devuelve todos los problemas.
 */
export function validarColor(texto: string, paleta: Readonly<Record<string, string>>, ambito: 'nodo' | 'arista' | 'pagina' = 'nodo'): ErrorDeColor[] {
  const expresion = leer(texto);
  if (expresion === undefined) return [{ mensaje: `'${texto}' no es una expresion de color valida (nombre, nombre/alfa o mix(a, b, t))` }];
  const errores: ErrorDeColor[] = [];
  const necesitaHex = expresion.alfa !== undefined || expresion.base.tipo === 'mix';
  const comprobar = (nombre: string): void => {
    if (!Object.hasOwn(paleta, nombre)) {
      errores.push({ mensaje: `Color '${nombre}' no es un nombre de Paleta del Tema`, fueraDePaleta: true, ...sugerir(nombre, Object.keys(paleta)) });
    } else if (necesitaHex && hexARgb(paleta[nombre] as string) === undefined) {
      errores.push({ mensaje: `El color '${nombre}' de la Paleta no es un hex (#rgb o #rrggbb); alfa y mix lo necesitan` });
    }
  };
  const especial = (nombre: 'COLOR' | 'ORIGEN'): void => {
    if (nombre === 'ORIGEN' && ambito !== 'arista') errores.push({ mensaje: "'ORIGEN' solo vale en Aristas (es el color del Nodo de origen)" });
    else if (nombre === 'COLOR' && ambito === 'pagina') errores.push({ mensaje: "'COLOR' no vale en la pagina (es el color del Tipo de nodo); usa un nombre de Paleta" });
  };
  /** Operando de un `mix`: un nombre de Paleta o uno de los especiales. */
  const operando = (nombre: string): void => (esEspecial(nombre) ? especial(nombre) : comprobar(nombre));
  const { base, alfa } = expresion;
  if (base.tipo === 'paleta') comprobar(base.nombre);
  else if (base.tipo === 'mix') {
    operando(base.a);
    operando(base.b);
    if (base.t < 0 || base.t > 1) errores.push({ mensaje: `El factor de mix debe estar entre 0 y 1, no ${base.t}` });
  } else especial(base.nombre);
  if (alfa !== undefined && (alfa < 0 || alfa > 1)) errores.push({ mensaje: `El alfa debe estar entre 0 y 1, no ${alfa}` });
  return errores;
}

const aHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * Valor de pintura de una expresion ya valida: el hex de la Paleta tal cual si
 * no hay modificadores, `#rrggbb` para un `mix` y `rgba(r, g, b, a)` con alfa.
 * Una expresion invalida se devuelve sin cambios (la validacion la rechazo antes).
 */
export function resolverColor(texto: string, paleta: Readonly<Record<string, string>>, contexto: ContextoDeColor = {}): string {
  const expresion = leer(texto);
  if (expresion === undefined) return texto;
  const { base, alfa } = expresion;
  if (base.tipo === 'especial' && base.nombre === 'COLOR' && contexto.variable !== undefined) {
    const variable = `var(${contexto.variable})`;
    return alfa === undefined ? variable : `color-mix(in srgb, ${variable} ${Math.round(alfa * 10000) / 100}%, transparent)`;
  }
  /** Nombre de Paleta de un nombre o de un especial (`COLOR`, `ORIGEN`) segun el contexto. */
  const dePaleta = (nombre: string): string | undefined => (nombre === 'COLOR' ? contexto.color : nombre === 'ORIGEN' ? contexto.origen : nombre);
  let valor: string;
  if (base.tipo === 'mix' && contexto.variable !== undefined && (base.a === 'COLOR' || base.b === 'COLOR')) {
    // `COLOR` es una variable CSS: la mezcla la hace el navegador (`t` es la parte de `b`, como en la mezcla con hex).
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
