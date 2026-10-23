/**
 * Catalogo de Primitivas y de Slots (ADR 0008): la fuente unica de la que salen
 * la validacion, los mensajes y, mas adelante, `inspect` y la tabla de docs.
 * Anadir una Primitiva es una entrada aqui (mas su pintor en `render`).
 *
 * Esta rebanada trae tres Primitivas (una por Familia) y dos Slots; el resto
 * del catalogo llega por Familia en tickets posteriores.
 */
import { CODIGOS, candidatosCercanos } from 'canonico';

/** Valor de una propiedad de Primitiva: numero con rango, o color (nombre de Paleta). */
export type DefinicionDePropiedad =
  | { readonly tipo: 'numero'; readonly min: number; readonly max: number; readonly defecto?: number }
  | { readonly tipo: 'color' };

export interface DefinicionDePrimitiva {
  readonly familia: 'forma' | 'relleno' | 'borde';
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
} as const satisfies Record<string, DefinicionDePrimitiva>;

export type NombreDePrimitiva = keyof typeof CATALOGO;

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
const esSlot = (nombre: string): nombre is NombreDeSlot => (SLOTS as readonly string[]).includes(nombre);

const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string } => {
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
): { primitiva?: Primitiva; errores: ErrorDeCatalogo[] } {
  if (!esPrimitiva(tipo)) {
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_PRIMITIVE,
          mensaje: `Primitiva '${tipo}' desconocida; disponibles: ${Object.keys(CATALOGO).join(', ')}`,
          ...sugerir(tipo, Object.keys(CATALOGO)),
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
      const nombre = String(valor);
      if (Object.hasOwn(paleta, nombre)) resultado[clave] = nombre;
      else {
        errores.push({
          codigo: CODIGOS.E_UNKNOWN_PALETTE_COLOR,
          mensaje: `Color '${nombre}' no es un nombre de Paleta del Tema`,
          clave,
          ...sugerir(nombre, Object.keys(paleta)),
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
