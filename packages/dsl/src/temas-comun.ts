/**
 * Piezas comunes de la compilacion de Temas (ADR 0008): el contexto de un bloque, como leer las
 * propiedades escritas de una Capa (resolver `$token` y situar la propiedad culpable de un error)
 * y como convertir un error de catalogo en Issue. `temas-capas`, `temas-arista` y `temas-slots`
 * traducen cada uno su parte del AST con estas mismas funciones; solo traducen y situan, las
 * reglas son del catalogo de `tema`.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { construirPrimitiva, resolverTokens } from 'tema';
import type { ErrorDeCatalogo, Primitiva, PropiedadEscrita, UbicacionDePrimitiva } from 'tema';

import type { LayerProp, PartDecl } from './generated/ast';
import { rangoDe } from './posiciones';

export interface ParteDeclarada {
  archivo: string;
  ast: PartDecl;
  nombre: TextRange;
}

/** Lo minimo para compilar cualquier parte de un Tema: de donde viene, que Partes y Tokens ve, y donde dejar los errores. */
export interface Contexto {
  archivo: string;
  partes: ReadonlyMap<string, ParteDeclarada>;
  paleta: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  issues: Issue[];
}

/**
 * Propiedades escritas de una Capa como pares clave-valor para el catalogo.
 * `offset x y` (dos valores) se expande a `offset-x` y `offset-y`; un segundo
 * valor en cualquier otra clave se conserva en el valor para que el catalogo
 * lo rechace con su mensaje habitual.
 */
export function propiedadesEscritas(props: readonly LayerProp[]): Array<{ clave: string; valor: string }> {
  return props.flatMap(({ key, value, second }) => {
    if (second === undefined) return [{ clave: key, valor: value }];
    if (key === 'offset') return [{ clave: 'offset-x', valor: value }, { clave: 'offset-y', valor: second }];
    return [{ clave: key, valor: `${value} ${second}` }];
  });
}

/** La propiedad escrita que origino `clave` (`offset-x` y `offset-y` salen de `offset`); sirve para situar un error. */
export const propiedadDeClave = (props: readonly LayerProp[], clave: string): LayerProp | undefined =>
  props.find(({ key, second }) => key === clave || (key === 'offset' && second !== undefined && (clave === 'offset-x' || clave === 'offset-y')));

/** Las propiedades de `lista` con sus `$token` sustituidos, cada una con la propiedad escrita (`ref`) que la origino, y los errores de token. */
export function propiedadesResueltas(lista: readonly LayerProp[], tokens: Readonly<Record<string, string>>): { props: Array<PropiedadEscrita<LayerProp>>; errores: ErrorDeCatalogo[] } {
  const { props, errores } = resolverTokens(propiedadesEscritas(lista), tokens);
  return {
    props: props.flatMap(({ clave, valor }) => {
      const ref = propiedadDeClave(lista, clave);
      return ref === undefined ? [] : [{ clave, valor, ref }];
    }),
    errores,
  };
}

/** Inicio de la propiedad culpable de un error: su clave si la propiedad no existe, su valor si existe pero no vale. */
export const inicioDePropiedad = (prop: LayerProp, error: ErrorDeCatalogo): { line: number; column: number } =>
  rangoDe(prop, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value').start;

export function aIssue(archivo: string, error: ErrorDeCatalogo, inicio: { line: number; column: number }): Issue {
  return { code: error.codigo, severity: 'error', file: archivo, ...inicio, message: error.mensaje, ...(error.hint !== undefined && { hint: error.hint }) };
}

/** Primitiva suelta (marcador, etiqueta, estilo de Slot) desde sus props escritas; deja los errores en `ctx.issues`. */
export function primitivaSuelta(
  tipo: string,
  props: readonly LayerProp[],
  ubicacion: UbicacionDePrimitiva,
  ctx: Contexto,
  culpable: { line: number; column: number },
): Primitiva | undefined {
  const resueltas = propiedadesResueltas(props, ctx.tokens);
  const { primitiva, errores } = construirPrimitiva(tipo, resueltas.props, ctx.paleta, ubicacion);
  for (const error of [...resueltas.errores, ...errores]) {
    const prop = error.clave === undefined ? undefined : propiedadDeClave(props, error.clave);
    ctx.issues.push(aIssue(ctx.archivo, error, prop !== undefined ? inicioDePropiedad(prop, error) : culpable));
  }
  return resueltas.errores.length === 0 && errores.length === 0 ? primitiva : undefined;
}
