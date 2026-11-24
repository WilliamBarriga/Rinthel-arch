/** Catalogo de Primitivas y Slots: fuente unica de la validacion, los mensajes y la referencia generada. */
import { CODIGOS, VALORES_DE_CATALOGO_ANTIGUOS, candidatosCercanos, mensajeDeValorAntiguo, renombreAntiguo } from 'canonico';
import type { CategoriaDeCatalogo } from 'canonico';

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

export type DefinicionDePropiedad =
  | { readonly tipo: 'numero'; readonly min: number; readonly max: number; readonly defecto?: number; readonly opcional?: true }
  | { readonly tipo: 'color'; readonly opcional?: true }
  | { readonly tipo: 'opcion'; readonly valores: readonly string[]; readonly defecto?: string; readonly opcional?: true }
  /** Componente de Tema: identificador que empieza en mayuscula. */
  | { readonly tipo: 'nombre' }
  /** Texto entre comillas de a lo sumo `largo` caracteres. */
  | { readonly tipo: 'texto'; readonly largo: number; readonly opcional?: true };

/** `capa-nodo` es el defecto; `capa-pagina` admite solo la Familia relleno. */
export type UbicacionDePrimitiva = 'capa-nodo' | 'capa-arista' | 'marcador' | 'etiqueta' | 'texto-slot' | 'capa-pagina';

export interface DefinicionDePrimitiva {
  readonly familia: 'forma' | 'relleno' | 'borde' | 'trazo' | 'marcador' | 'texto' | 'codigo' | FamiliaDeEfectos;
  readonly ubicacion?: UbicacionDePrimitiva;
  readonly propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  readonly afectaMetricas: boolean;
  /** Propiedades de color que cubren la caja: fondo contra el que se mide el contraste del texto. Solo Familia relleno. */
  readonly fondoDeTexto?: readonly string[];
  readonly cajaMinima?: 'cuadrado';
  /** Acepta propiedades no declaradas (parametros de un Componente de Tema), numero o texto tal cual. */
  readonly abierta?: true;
}

/** Propiedades comunes a toda Capa de Nodo o Grupo: `offset x y` y `grow`. Solo pintan; sin defecto. */
export const PROPIEDADES_DE_DESPLAZAMIENTO = {
  'offset-x': { tipo: 'numero', min: -200, max: 200 },
  'offset-y': { tipo: 'numero', min: -200, max: 200 },
  grow: { tipo: 'numero', min: -100, max: 100 },
} as const satisfies Record<string, DefinicionDePropiedad>;

/** `zone` de una Capa de Nodo: `all` (ausente), `header` (Slots anteriores a `attrs`; sin `attrs`, `all`) o `body` (`attrs`). */
export const ZONAS = ['all', 'header', 'body'] as const;
export const PROPIEDAD_DE_ZONA = { zone: { tipo: 'opcion', valores: ZONAS, opcional: true } } as const satisfies Record<string, DefinicionDePropiedad>;

export const CATALOGO = {
  rect: { familia: 'forma', afectaMetricas: false, propiedades: { radius: { tipo: 'numero', min: 0, max: 100, defecto: 0 } } },
  solid: { familia: 'relleno', afectaMetricas: false, propiedades: { color: { tipo: 'color' } }, fondoDeTexto: ['color'] },
  border: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: { tipo: 'numero', min: 1, max: 16, defecto: 1 } },
  },
  ...FORMAS,
  ...RELLENOS,
  ...BORDES,
  ...CATALOGO_DE_EFECTOS,
  ...TRAZOS,
  ...MARCADORES,
  ...TEXTOS,
  ...CODIGO,
} as const satisfies Record<string, DefinicionDePrimitiva>;

export type NombreDePrimitiva = keyof typeof CATALOGO;

/** Con el tipo ancho: el literal del catalogo pierde las claves opcionales. */
export const definicionDe = (nombre: NombreDePrimitiva): DefinicionDePrimitiva => CATALOGO[nombre];

/** En orden de catalogo. */
export const primitivasDeFamilia = (familia: DefinicionDePrimitiva['familia']): NombreDePrimitiva[] =>
  (Object.keys(CATALOGO) as NombreDePrimitiva[]).filter((nombre) => definicionDe(nombre).familia === familia);

/** Sin `ubicacion` declarada, una Primitiva es Capa de Nodo. */
export type NombreDePrimitivaEn<U extends UbicacionDePrimitiva> = {
  [K in NombreDePrimitiva]: (typeof CATALOGO)[K] extends { readonly ubicacion: infer V } ? (V extends U ? K : never) : U extends 'capa-nodo' ? K : never;
}[NombreDePrimitiva];

export interface DefinicionDeSlot {
  readonly estilo: 'text' | 'icon' | 'chip';
  readonly elastico: boolean;
  /** Slot de una sola linea de texto, medido con `textoDeSlot`; no se deriva del estilo (`attrs` es `text` y no lo es). */
  readonly texto?: true;
  /** Relativo al tamano de texto del Tema. */
  readonly escala?: number;
  /** Relativo al tamano del texto; sin el, el alto de cabecera de las Metricas. */
  readonly interlineado?: number;
}

export const DEFINICION_DE_SLOT = {
  icon: { estilo: 'icon', elastico: false },
  title: { estilo: 'text', elastico: true, texto: true },
  /** El Tipo de nodo. */
  badge: { estilo: 'text', elastico: true, texto: true, escala: 0.74, interlineado: 1.25 },
  desc: { estilo: 'text', elastico: true, texto: true, escala: 0.85, interlineado: 1.25 },
  /** La primera `source` del Nodo. */
  footer: { estilo: 'text', elastico: true, texto: true, escala: 0.75, interlineado: 1.25 },
  attrs: { estilo: 'text', elastico: true },
  /** Hijos que esconde un Grupo colapsado. */
  counter: { estilo: 'chip', elastico: false, texto: true, escala: 0.8, interlineado: 1.25 },
} as const satisfies Record<string, DefinicionDeSlot>;
export type NombreDeSlot = keyof typeof DEFINICION_DE_SLOT;
export const SLOTS = Object.keys(DEFINICION_DE_SLOT) as NombreDeSlot[];
export type NombreDeSlotDeTexto = { [S in NombreDeSlot]: (typeof DEFINICION_DE_SLOT)[S] extends { readonly texto: true } ? S : never }[NombreDeSlot];
export const SLOTS_DE_TEXTO = SLOTS.filter((slot): slot is NombreDeSlotDeTexto => 'texto' in DEFINICION_DE_SLOT[slot]);

/** Ya validada: propiedades con defectos, colores aun como nombre de Paleta. */
export interface Primitiva {
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

/** `clave` situa la propiedad culpable. */
export interface ErrorDeCatalogo {
  codigo: string;
  mensaje: string;
  clave?: string;
  hint?: string;
  /** Solo si hay un unico candidato cercano. */
  candidato?: string;
}

const esPrimitiva = (nombre: string): nombre is NombreDePrimitiva => Object.hasOwn(CATALOGO, nombre);
const ubicacionDe = (nombre: NombreDePrimitiva): UbicacionDePrimitiva => definicionDe(nombre).ubicacion ?? 'capa-nodo';
const valeEn = (nombre: NombreDePrimitiva, ubicacion: UbicacionDePrimitiva): boolean =>
  ubicacion === 'capa-pagina' ? definicionDe(nombre).familia === 'relleno' : ubicacionDe(nombre) === ubicacion;
export const primitivasDe = (ubicacion: UbicacionDePrimitiva): string[] =>
  (Object.keys(CATALOGO) as NombreDePrimitiva[]).filter((nombre) => valeEn(nombre, ubicacion));
export const ubicacionesDe = (nombre: NombreDePrimitiva): UbicacionDePrimitiva[] =>
  valeEn(nombre, 'capa-pagina') ? [ubicacionDe(nombre), 'capa-pagina'] : [ubicacionDe(nombre)];
export const esSlot = (nombre: string): nombre is NombreDeSlot => Object.hasOwn(DEFINICION_DE_SLOT, nombre);

export const sugerir = (escrito: string, existentes: Iterable<string>): { hint?: string; candidato?: string } => {
  const candidatos = candidatosCercanos(escrito, existentes);
  const [unico] = candidatos;
  return candidatos.length === 0 ? {} : { hint: `did you mean ${candidatos.map((c) => `'${c}'`).join(' or ')}`, ...(candidatos.length === 1 && unico !== undefined && { candidato: unico }) };
};

/** Devuelve todos los errores a la vez; fuera de rango es error, nunca se recorta. Los valores llegan como texto del DSL. */
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
            ? `Primitive '${tipo}' is not valid here (it belongs to ${ubicacionesDe(tipo).join(' and ')}); available: ${validas.join(', ')}`
            : `Unknown Primitive '${tipo}'; available: ${validas.join(', ')}`,
          ...sugerir(tipo, validas),
        },
      ],
    };
  }
  const base: DefinicionDePrimitiva = CATALOGO[tipo];
  const definidas = ubicacion === 'capa-nodo' && base.abierta !== true ? { ...base.propiedades, ...PROPIEDADES_DE_DESPLAZAMIENTO, ...PROPIEDAD_DE_ZONA } : base.propiedades;
  const { propiedades, errores } = validarPropiedades({ sujeto: `Primitive '${tipo}'`, nombre: `'${tipo}'`, propiedades: definidas, abierta: base.abierta === true }, props, paleta, ubicacion === 'capa-nodo' || ubicacion === 'texto-slot' ? 'nodo' : ubicacion === 'capa-pagina' ? 'pagina' : 'arista');
  return errores.length > 0 ? { errores } : { primitiva: { tipo, props: propiedades }, errores };
}

export interface ConjuntoDePropiedades {
  /** P. ej. `La Primitiva 'rect'`. */
  sujeto: string;
  /** Para "'clave' de 'rect' debe ser ...". */
  nombre: string;
  propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  abierta?: boolean;
}

/** Regla unica de rangos, opciones, colores y defectos, compartida por Primitivas y cajas de Slots. */
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
        mensaje: `${sujeto} has no property '${clave}'; available: ${Object.keys(definidas).join(', ')}`,
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
      else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `'${clave}' of ${nombre} must be a Component name (starts with an uppercase letter, e.g. Aurora), not '${valor}'`, clave });
    } else if (propiedad.tipo === 'texto') {
      const texto = String(valor);
      if (texto.length <= propiedad.largo) resultado[clave] = texto;
      else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `'${clave}' of ${nombre} must be text of at most ${propiedad.largo} characters, not '${texto}'`, clave });
    } else if (propiedad.tipo === 'opcion') {
      if (propiedad.valores.includes(String(valor))) resultado[clave] = String(valor);
      else {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' of ${nombre} must be one of ${propiedad.valores.join(', ')}, not '${valor}'`,
          clave,
          ...sugerir(String(valor), propiedad.valores),
        });
      }
    } else {
      const numero = typeof valor === 'number' ? valor : /^-?\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : Number.NaN;
      if (Number.isNaN(numero) || numero < propiedad.min || numero > propiedad.max) {
        errores.push({
          codigo: CODIGOS.E_THEME_INVALID_VALUE,
          mensaje: `'${clave}' of ${nombre} must be a number between ${propiedad.min} and ${propiedad.max}, not '${valor}'`,
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
    else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `${sujeto} requires the property '${clave}'`, clave });
  }
  return { propiedades: resultado, errores };
}


/** Un token no declarado o no numerico es un error, nunca un valor por defecto. */
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
        mensaje: `Token '${valor}' is not declared in the Theme's 'tokens'`,
        clave,
        ...sugerir(nombre, Object.keys(tokens)),
      });
      continue;
    }
    const numero = Number(tokens[nombre]);
    if (Number.isFinite(numero)) resueltas.push({ clave, valor: numero });
    else errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `Token '${valor}' is not a number ('${tokens[nombre]}')`, clave });
  }
  return { props: resueltas, errores };
}

/** Un nombre antiguo (espanol) de `categoria` es el error `old-catalog-value` con el nuevo como `candidato` (el `fix`); `undefined` si no lo es. */
export function errorDeValorAntiguo(categoria: CategoriaDeCatalogo, escrito: string): ErrorDeCatalogo | undefined {
  const nuevo = renombreAntiguo(VALORES_DE_CATALOGO_ANTIGUOS, categoria, escrito);
  if (nuevo === undefined) return undefined;
  return { codigo: CODIGOS.E_OLD_CATALOG_VALUE, mensaje: mensajeDeValorAntiguo(categoria, escrito, nuevo), candidato: nuevo };
}
