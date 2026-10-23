/**
 * Catalogo de Primitivas y de Slots (ADR 0008): la fuente unica de la que salen
 * la validacion, los mensajes y, mas adelante, `inspect` y la tabla de docs.
 * Anadir una Primitiva es una entrada aqui (mas su pintor en `render`).
 *
 * Esta rebanada trae tres Primitivas (una por Familia) y dos Slots; el resto
 * del catalogo llega por Familia en tickets posteriores.
 */
import { CODIGOS, candidatosCercanos } from 'canonico';

import { validarColor } from './color';
import { MARCADORES } from './familias/marcador';
import { TEXTOS } from './familias/texto';
import { TRAZOS } from './familias/trazo';

/** Valor de una propiedad de Primitiva: numero con rango, o color (nombre de Paleta). */
export type DefinicionDePropiedad =
  | { readonly tipo: 'numero'; readonly min: number; readonly max: number; readonly defecto?: number }
  | { readonly tipo: 'color'; readonly opcional?: true }
  | { readonly tipo: 'opcion'; readonly valores: readonly string[]; readonly defecto: string };

/** Donde se usa una Primitiva: Capa de Nodo (defecto), Capa de Arista, marcador de extremo, etiqueta de Arista o estilo de texto de un Slot. */
export type UbicacionDePrimitiva = 'capa-nodo' | 'capa-arista' | 'marcador' | 'etiqueta' | 'texto-slot';

export interface DefinicionDePrimitiva {
  readonly familia: 'forma' | 'relleno' | 'borde' | 'trazo' | 'marcador' | 'texto';
  readonly ubicacion?: UbicacionDePrimitiva;
  readonly propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  /** Si cambia la caja o los Slots (Metricas). Por defecto una Primitiva solo pinta. */
  readonly afectaMetricas: boolean;
}

export const CATALOGO = {
  rect: { familia: 'forma', afectaMetricas: false, propiedades: { radius: { tipo: 'numero', min: 0, max: 100, defecto: 0 } } },
  solid: { familia: 'relleno', afectaMetricas: false, propiedades: { color: { tipo: 'color' } } },
  border: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: { tipo: 'numero', min: 1, max: 16, defecto: 1 } },
  },
  // Una entrada por Familia, cada una en su archivo (`familias/`).
  ...TRAZOS,
  ...MARCADORES,
  ...TEXTOS,
} as const satisfies Record<string, DefinicionDePrimitiva>;

export type NombreDePrimitiva = keyof typeof CATALOGO;

/** Nombres de las Primitivas declaradas para `U`; sin `ubicacion` declarada son Capas de Nodo. Sirve para tablas de pintores exhaustivas. */
export type NombreDePrimitivaEn<U extends UbicacionDePrimitiva> = {
  [K in NombreDePrimitiva]: (typeof CATALOGO)[K] extends { readonly ubicacion: infer V } ? (V extends U ? K : never) : U extends 'capa-nodo' ? K : never;
}[NombreDePrimitiva];

/** Slots que el catalogo sabe colocar hoy; el orden de un bloque `slots` es el orden visual. */
export const SLOTS = ['title', 'attrs'] as const;
export type NombreDeSlot = (typeof SLOTS)[number];

/** Primitiva ya validada: propiedades completas (con defectos), colores aun como nombre de Paleta. */
export interface Primitiva {
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

/** Error de catalogo; `clave` situa la propiedad culpable para quien conoce las posiciones del texto. */
export interface ErrorDeCatalogo {
  codigo: string;
  mensaje: string;
  clave?: string;
  hint?: string;
}

const esPrimitiva = (nombre: string): nombre is NombreDePrimitiva => Object.hasOwn(CATALOGO, nombre);
const ubicacionDe = (nombre: NombreDePrimitiva): UbicacionDePrimitiva => (CATALOGO[nombre] as DefinicionDePrimitiva).ubicacion ?? 'capa-nodo';
/** Nombres de las Primitivas que valen en `ubicacion`. */
export const primitivasDe = (ubicacion: UbicacionDePrimitiva): string[] =>
  (Object.keys(CATALOGO) as NombreDePrimitiva[]).filter((nombre) => ubicacionDe(nombre) === ubicacion);
const esSlot = (nombre: string): nombre is NombreDeSlot => (SLOTS as readonly string[]).includes(nombre);

export const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string } => {
  const candidatos = candidatosCercanos(escrito, existentes);
  return candidatos.length === 0 ? {} : { hint: `quisiste decir ${candidatos.map((c) => `'${c}'`).join(' o ')}` };
};

/**
 * Valida una Primitiva contra el catalogo y devuelve todos los errores a la vez.
 * Un valor fuera de rango o de otro tipo es un error, nunca se recorta. Los
 * valores llegan como se escriben en el DSL (texto) y los numeros se leen aqui.
 */
export function construirPrimitiva(
  tipo: string,
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  paleta: Readonly<Record<string, string>>,
  ubicacion: UbicacionDePrimitiva = 'capa-nodo',
): { primitiva?: Primitiva; errores: ErrorDeCatalogo[] } {
  if (!esPrimitiva(tipo) || ubicacionDe(tipo) !== ubicacion) {
    const validas = primitivasDe(ubicacion);
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_PRIMITIVE,
          mensaje: esPrimitiva(tipo)
            ? `La Primitiva '${tipo}' no vale aqui (es de ${ubicacionDe(tipo)}); disponibles: ${validas.join(', ')}`
            : `Primitiva '${tipo}' desconocida; disponibles: ${validas.join(', ')}`,
          ...sugerir(tipo, validas),
        },
      ],
    };
  }
  const definicion: DefinicionDePrimitiva = CATALOGO[tipo];
  const errores: ErrorDeCatalogo[] = [];
  const resultado: Record<string, number | string> = {};

  for (const { clave, valor } of props) {
    const propiedad = definicion.propiedades[clave];
    if (propiedad === undefined) {
      errores.push({
        codigo: CODIGOS.E_THEME_UNKNOWN_PROPERTY,
        mensaje: `La Primitiva '${tipo}' no tiene la propiedad '${clave}'; disponibles: ${Object.keys(definicion.propiedades).join(', ')}`,
        clave,
        ...sugerir(clave, Object.keys(definicion.propiedades)),
      });
    } else if (propiedad.tipo === 'color') {
      const expresion = String(valor);
      const problemas = validarColor(expresion, paleta, ubicacion === 'capa-nodo' || ubicacion === 'texto-slot' ? 'nodo' : 'arista');
      if (problemas.length === 0) resultado[clave] = expresion;
      for (const problema of problemas) {
        errores.push({
          codigo: problema.fueraDePaleta === true ? CODIGOS.E_UNKNOWN_PALETTE_COLOR : CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: problema.mensaje,
          clave,
          ...(problema.hint !== undefined && { hint: problema.hint }),
        });
      }
    } else if (propiedad.tipo === 'opcion') {
      if (propiedad.valores.includes(String(valor))) resultado[clave] = String(valor);
      else {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' de '${tipo}' debe ser uno de ${propiedad.valores.join(', ')}, no '${valor}'`,
          clave,
          ...sugerir(String(valor), propiedad.valores),
        });
      }
    } else {
      const numero = typeof valor === 'number' ? valor : /^-?\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : Number.NaN;
      if (Number.isNaN(numero) || numero < propiedad.min || numero > propiedad.max) {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' de '${tipo}' debe ser un numero entre ${propiedad.min} y ${propiedad.max}, no '${valor}'`,
          clave,
        });
      } else resultado[clave] = numero;
    }
  }

  const dadas = new Set(props.map((p) => p.clave));
  for (const [clave, propiedad] of Object.entries(definicion.propiedades)) {
    if (dadas.has(clave)) continue;
    if (propiedad.tipo === 'numero' && propiedad.defecto !== undefined) resultado[clave] = propiedad.defecto;
    else if (propiedad.tipo === 'opcion') resultado[clave] = propiedad.defecto;
    else if (propiedad.tipo === 'color' && propiedad.opcional === true) continue;
    else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `La Primitiva '${tipo}' exige la propiedad '${clave}'`, clave });
  }
  return errores.length > 0 ? { errores } : { primitiva: { tipo, props: resultado }, errores };
}

/** Valida un bloque `slots` (nombres conocidos, sin repetir) y devuelve los validos en orden. */
export function construirSlots(nombres: readonly string[]): { slots: NombreDeSlot[]; errores: Array<ErrorDeCatalogo & { indice: number }> } {
  const slots: NombreDeSlot[] = [];
  const errores: Array<ErrorDeCatalogo & { indice: number }> = [];
  nombres.forEach((nombre, indice) => {
    if (!esSlot(nombre)) {
      errores.push({
        codigo: CODIGOS.E_THEME_UNKNOWN_SLOT,
        mensaje: `Slot '${nombre}' desconocido; disponibles: ${SLOTS.join(', ')}`,
        indice,
        ...sugerir(nombre, SLOTS),
      });
    } else if (slots.includes(nombre)) {
      errores.push({ codigo: CODIGOS.E_THEME_UNKNOWN_SLOT, mensaje: `Slot '${nombre}' repetido`, indice });
    } else slots.push(nombre);
  });
  return { slots, errores };
}

/**
 * Sustituye cada valor `$token` por el numero del bloque `tokens` del Tema. Un
 * token no declarado o no numerico es un error (nunca un valor por defecto).
 */
export function resolverTokens(
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  tokens: Readonly<Record<string, string>>,
): { props: Array<{ clave: string; valor: string | number }>; errores: ErrorDeCatalogo[] } {
  const errores: ErrorDeCatalogo[] = [];
  const resueltas: Array<{ clave: string; valor: string | number }> = [];
  for (const { clave, valor } of props) {
    if (typeof valor !== 'string' || !valor.startsWith('$')) {
      resueltas.push({ clave, valor });
      continue;
    }
    const nombre = valor.slice(1);
    if (!Object.hasOwn(tokens, nombre)) {
      errores.push({
        codigo: CODIGOS.E_THEME_UNKNOWN_TOKEN,
        mensaje: `Token '${valor}' no declarado en 'tokens' del Tema`,
        clave,
        ...sugerir(nombre, Object.keys(tokens)),
      });
      continue;
    }
    const numero = Number(tokens[nombre]);
    if (Number.isFinite(numero)) resueltas.push({ clave, valor: numero });
    else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `El token '${valor}' no es un numero ('${tokens[nombre]}')`, clave });
  }
  return { props: resueltas, errores };
}
