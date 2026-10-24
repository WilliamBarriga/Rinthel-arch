/**
 * Catalogo de Primitivas y de Slots (ADR 0008): la fuente unica de la que salen
 * la validacion, los mensajes y, mas adelante, `inspect` y la tabla de docs.
 * Anadir una Primitiva es una entrada aqui (mas su pintor en `render`).
 *
 * `rect`, `solid` y `border` viven aqui; el resto de las Familias forma, relleno
 * y borde estan en `familias/`, un archivo por Familia, y se suman al registro.
 */
import { CODIGOS, candidatosCercanos } from 'canonico';

import { CATALOGO_DE_EFECTOS } from './catalogo-efectos';
import type { FamiliaDeEfectos } from './catalogo-efectos';
import { validarColor } from './color';
import { BORDES } from './familias/borde';
import { CODIGO } from './familias/codigo';
import { FORMAS } from './familias/forma';
import { MARCADORES } from './familias/marcador';
import { RELLENOS } from './familias/relleno';
import { TEXTOS } from './familias/texto';
import { TRAZOS } from './familias/trazo';

/** Valor de una propiedad de Primitiva: numero con rango, o color (nombre de Paleta). */
export type DefinicionDePropiedad =
  | { readonly tipo: 'numero'; readonly min: number; readonly max: number; readonly defecto?: number; readonly opcional?: true }
  | { readonly tipo: 'color'; readonly opcional?: true }
  | { readonly tipo: 'opcion'; readonly valores: readonly string[]; readonly defecto?: string; readonly opcional?: true }
  /** Nombre de un Componente de Tema: identificador que empieza en mayuscula. */
  | { readonly tipo: 'nombre' }
  /** Texto literal entre comillas, de a lo sumo `largo` caracteres. */
  | { readonly tipo: 'texto'; readonly largo: number; readonly opcional?: true };

/** Donde se usa una Primitiva: Capa de Nodo (defecto), Capa de la pagina (solo las de la Familia relleno, que tambien valen en el Nodo), Capa de Arista, marcador de extremo, etiqueta de Arista o estilo de texto de un Slot. */
export type UbicacionDePrimitiva = 'capa-nodo' | 'capa-arista' | 'marcador' | 'etiqueta' | 'texto-slot' | 'capa-pagina';

export interface DefinicionDePrimitiva {
  readonly familia: 'forma' | 'relleno' | 'borde' | 'trazo' | 'marcador' | 'texto' | 'codigo' | FamiliaDeEfectos;
  readonly ubicacion?: UbicacionDePrimitiva;
  readonly propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  /** Si cambia la caja o los Slots (Metricas). Por defecto una Primitiva solo pinta. */
  readonly afectaMetricas: boolean;
  /** Regla de caja minima que exige la forma; sin ella, cualquier caja sirve. */
  readonly cajaMinima?: 'cuadrado';
  /** Acepta ademas propiedades no declaradas (los parametros de un Componente de Tema): numero o texto, tal cual. */
  readonly abierta?: true;
}

/**
 * Propiedades de pintura que acepta toda Capa de Nodo o Grupo sin que cada
 * Primitiva las declare: `offset x y` (el DSL las escribe juntas) mueve la Capa
 * y `grow` agranda su ancho y alto. Solo pintan: ni cambian las Metricas ni
 * provocan relayout, asi que un parche de estado puede animarlas. Sin defecto:
 * ausentes, la Capa se pinta sobre la caja.
 */
export const PROPIEDADES_DE_DESPLAZAMIENTO = {
  'offset-x': { tipo: 'numero', min: -200, max: 200 },
  'offset-y': { tipo: 'numero', min: -200, max: 200 },
  grow: { tipo: 'numero', min: -100, max: 100 },
} as const satisfies Record<string, DefinicionDePropiedad>;

export const CATALOGO = {
  rect: { familia: 'forma', afectaMetricas: false, propiedades: { radius: { tipo: 'numero', min: 0, max: 100, defecto: 0 } } },
  solid: { familia: 'relleno', afectaMetricas: false, propiedades: { color: { tipo: 'color' } } },
  border: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: { tipo: 'numero', min: 1, max: 16, defecto: 1 } },
  },
  ...FORMAS,
  ...RELLENOS,
  ...BORDES,
  ...CATALOGO_DE_EFECTOS,
  // Aristas y texto de Slot: una entrada por Familia, cada una en su archivo (`familias/`).
  ...TRAZOS,
  ...MARCADORES,
  ...TEXTOS,
  ...CODIGO,
} as const satisfies Record<string, DefinicionDePrimitiva>;

export type NombreDePrimitiva = keyof typeof CATALOGO;

/** Nombres de las Primitivas declaradas para `U`; sin `ubicacion` declarada son Capas de Nodo. Sirve para tablas de pintores exhaustivas. */
export type NombreDePrimitivaEn<U extends UbicacionDePrimitiva> = {
  [K in NombreDePrimitiva]: (typeof CATALOGO)[K] extends { readonly ubicacion: infer V } ? (V extends U ? K : never) : U extends 'capa-nodo' ? K : never;
}[NombreDePrimitiva];

/** Definicion de un Slot: con que Primitiva se estiliza, si se estira en su fila y, para los de texto, tamano y interlineado por defecto. */
export interface DefinicionDeSlot {
  readonly estilo: 'text' | 'icon' | 'chip';
  readonly elastico: boolean;
  /** Tamano del texto respecto al del Tema (`size` lo cambia). */
  readonly escala?: number;
  /** Alto de la linea respecto al tamano del texto (`leading` lo cambia); sin el, el alto de cabecera de las Metricas. */
  readonly interlineado?: number;
}

/**
 * Slots que el catalogo sabe colocar. Un Slot nuevo es una entrada en
 * `DEFINICION_DE_SLOT`, su medida en `slots.ts` y su pintor en `render`; el
 * algoritmo de colocacion no cambia.
 */
export const DEFINICION_DE_SLOT = {
  /** Icono del Tipo de nodo: caja de lado fijo (Primitiva `icon`). */
  icon: { estilo: 'icon', elastico: false },
  /** Titulo: texto que se estira para ocupar el espacio libre de su fila. */
  title: { estilo: 'text', elastico: true },
  /** Insignia: el Tipo de nodo, en texto pequeno (normalmente bajo el titulo). */
  badge: { estilo: 'text', elastico: true, escala: 0.74, interlineado: 1.25 },
  /** Descripcion del Nodo; no reserva espacio si no tiene. */
  desc: { estilo: 'text', elastico: true, escala: 0.85, interlineado: 1.25 },
  /** Pie: la fuente del Nodo (la primera `source` del Modelo); no reserva espacio si no tiene. */
  footer: { estilo: 'text', elastico: true, escala: 0.75, interlineado: 1.25 },
  /** Filas de Atributo: una por Atributo visible. */
  attrs: { estilo: 'text', elastico: true },
  /** Contador: cuantos hijos esconde un Grupo colapsado, en una caja (Primitiva `chip`); solo existe en el colapsado. */
  counter: { estilo: 'chip', elastico: false, escala: 0.8, interlineado: 1.25 },
} as const satisfies Record<string, DefinicionDeSlot>;
export type NombreDeSlot = keyof typeof DEFINICION_DE_SLOT;
export const SLOTS = Object.keys(DEFINICION_DE_SLOT) as NombreDeSlot[];

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
  /** Unico candidato cercano ("quisiste decir"): el que un `fix` puede aplicar sin ambiguedad. */
  candidato?: string;
}

const esPrimitiva = (nombre: string): nombre is NombreDePrimitiva => Object.hasOwn(CATALOGO, nombre);
const ubicacionDe = (nombre: NombreDePrimitiva): UbicacionDePrimitiva => (CATALOGO[nombre] as DefinicionDePrimitiva).ubicacion ?? 'capa-nodo';
/** La pagina admite los rellenos; el resto de las ubicaciones, solo las Primitivas declaradas para ella. */
const valeEn = (nombre: NombreDePrimitiva, ubicacion: UbicacionDePrimitiva): boolean =>
  ubicacion === 'capa-pagina' ? (CATALOGO[nombre] as DefinicionDePrimitiva).familia === 'relleno' : ubicacionDe(nombre) === ubicacion;
/** Nombres de las Primitivas que valen en `ubicacion`. */
export const primitivasDe = (ubicacion: UbicacionDePrimitiva): string[] =>
  (Object.keys(CATALOGO) as NombreDePrimitiva[]).filter((nombre) => valeEn(nombre, ubicacion));
/** Ubicaciones donde vale una Primitiva (para la referencia generada). */
export const ubicacionesDe = (nombre: NombreDePrimitiva): UbicacionDePrimitiva[] =>
  valeEn(nombre, 'capa-pagina') ? [ubicacionDe(nombre), 'capa-pagina'] : [ubicacionDe(nombre)];
export const esSlot = (nombre: string): nombre is NombreDeSlot => Object.hasOwn(DEFINICION_DE_SLOT, nombre);

export const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string; candidato?: string } => {
  const candidatos = candidatosCercanos(escrito, existentes);
  const [unico] = candidatos;
  return candidatos.length === 0 ? {} : { hint: `quisiste decir ${candidatos.map((c) => `'${c}'`).join(' o ')}`, ...(candidatos.length === 1 && unico !== undefined && { candidato: unico }) };
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
  if (!esPrimitiva(tipo) || !valeEn(tipo, ubicacion)) {
    const validas = primitivasDe(ubicacion);
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_PRIMITIVE,
          mensaje: esPrimitiva(tipo)
            ? `La Primitiva '${tipo}' no vale aqui (es de ${ubicacionesDe(tipo).join(' y ')}); disponibles: ${validas.join(', ')}`
            : `Primitiva '${tipo}' desconocida; disponibles: ${validas.join(', ')}`,
          ...sugerir(tipo, validas),
        },
      ],
    };
  }
  const base: DefinicionDePrimitiva = CATALOGO[tipo];
  const definidas = ubicacion === 'capa-nodo' && base.abierta !== true ? { ...base.propiedades, ...PROPIEDADES_DE_DESPLAZAMIENTO } : base.propiedades;
  const { propiedades, errores } = validarPropiedades({ sujeto: `La Primitiva '${tipo}'`, nombre: `'${tipo}'`, propiedades: definidas, abierta: base.abierta === true }, props, paleta, ubicacion === 'capa-nodo' || ubicacion === 'texto-slot' ? 'nodo' : ubicacion === 'capa-pagina' ? 'pagina' : 'arista');
  return errores.length > 0 ? { errores } : { primitiva: { tipo, props: propiedades }, errores };
}

/** Lo que describe un conjunto de propiedades para `validarPropiedades`: como se nombra en los mensajes y cuales admite. */
export interface ConjuntoDePropiedades {
  /** Sujeto de los mensajes, p. ej. `La Primitiva 'rect'`. */
  sujeto: string;
  /** Nombre entre comillas para "'clave' de 'rect' debe ser ...". */
  nombre: string;
  propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  abierta?: boolean;
}

/**
 * Valida propiedades `clave valor` contra su definicion (la regla unica de
 * rangos, opciones, colores y defectos): Primitivas y bloques de disposicion
 * de Slots comparten estos mensajes y sugerencias.
 */
export function validarPropiedades(
  conjunto: ConjuntoDePropiedades,
  props: ReadonlyArray<{ clave: string; valor: string | number }>,
  paleta: Readonly<Record<string, string>>,
  contextoDeColor: 'nodo' | 'arista' | 'pagina' = 'nodo',
): { propiedades: Record<string, number | string>; errores: ErrorDeCatalogo[] } {
  const { sujeto, nombre, propiedades: definidas } = conjunto;
  const errores: ErrorDeCatalogo[] = [];
  const resultado: Record<string, number | string> = {};

  for (const { clave, valor } of props) {
    const propiedad = definidas[clave];
    if (propiedad === undefined && conjunto.abierta === true) {
      resultado[clave] = typeof valor === 'string' && /^-?\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : valor;
    } else if (propiedad === undefined) {
      errores.push({
        codigo: CODIGOS.E_THEME_UNKNOWN_PROPERTY,
        mensaje: `${sujeto} no tiene la propiedad '${clave}'; disponibles: ${Object.keys(definidas).join(', ')}`,
        clave,
        ...sugerir(clave, Object.keys(definidas)),
      });
    } else if (propiedad.tipo === 'color') {
      const expresion = String(valor);
      const problemas = validarColor(expresion, paleta, contextoDeColor);
      if (problemas.length === 0) resultado[clave] = expresion;
      for (const problema of problemas) {
        errores.push({
          codigo: problema.fueraDePaleta === true ? CODIGOS.E_UNKNOWN_PALETTE_COLOR : CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: problema.mensaje,
          clave,
          ...(problema.hint !== undefined && { hint: problema.hint }),
        });
      }
    } else if (propiedad.tipo === 'nombre') {
      if (/^[A-Z][A-Za-z0-9_]*$/.test(String(valor))) resultado[clave] = String(valor);
      else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `'${clave}' de ${nombre} debe ser un nombre de Componente (empieza en mayuscula, p. ej. Aurora), no '${valor}'`, clave });
    } else if (propiedad.tipo === 'texto') {
      const texto = String(valor);
      if (texto.length <= propiedad.largo) resultado[clave] = texto;
      else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `'${clave}' de ${nombre} debe ser un texto de a lo sumo ${propiedad.largo} caracteres, no '${texto}'`, clave });
    } else if (propiedad.tipo === 'opcion') {
      if (propiedad.valores.includes(String(valor))) resultado[clave] = String(valor);
      else {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' de ${nombre} debe ser uno de ${propiedad.valores.join(', ')}, no '${valor}'`,
          clave,
          ...sugerir(String(valor), propiedad.valores),
        });
      }
    } else {
      const numero = typeof valor === 'number' ? valor : /^-?\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : Number.NaN;
      if (Number.isNaN(numero) || numero < propiedad.min || numero > propiedad.max) {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' de ${nombre} debe ser un numero entre ${propiedad.min} y ${propiedad.max}, no '${valor}'`,
          clave,
        });
      } else resultado[clave] = numero;
    }
  }

  const dadas = new Set(props.map((p) => p.clave));
  for (const [clave, propiedad] of Object.entries(definidas)) {
    if (dadas.has(clave)) continue;
    if (propiedad.tipo === 'numero' && propiedad.defecto === undefined && (propiedad.opcional === true || clave in PROPIEDADES_DE_DESPLAZAMIENTO)) continue;
    if (propiedad.tipo === 'numero' && propiedad.defecto !== undefined) resultado[clave] = propiedad.defecto;
    else if (propiedad.tipo === 'opcion' && propiedad.defecto !== undefined) resultado[clave] = propiedad.defecto;
    else if (propiedad.tipo === 'opcion' && propiedad.opcional === true) continue;
    else if ((propiedad.tipo === 'color' || propiedad.tipo === 'texto') && propiedad.opcional === true) continue;
    else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `${sujeto} exige la propiedad '${clave}'`, clave });
  }
  return { propiedades: resultado, errores };
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
