/** Piezas comunes de la compilacion de Temas: contexto, propiedades escritas y errores de catalogo como Issue. */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { TIPOS_DE_DIAGRAMA, construirPrimitiva, resolverTokens } from 'tema';
import type { ErrorDeCatalogo, Primitiva, PropiedadEscrita, TipoDeDiagrama, UbicacionDePrimitiva } from 'tema';

import type { LayerProp, PartDecl, ThemeDiagram } from './generated/ast';
import { issueConSugerencia, rangoDe } from './posiciones';

export interface ParteDeclarada {
  archivo: string;
  ast: PartDecl;
  nombre: TextRange;
}

export interface Contexto {
  archivo: string;
  partes: ReadonlyMap<string, ParteDeclarada>;
  paleta: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  issues: Issue[];
}

/**
 * `offset x y` se expande a `offset-x` y `offset-y`; un segundo valor en cualquier otra clave se
 * conserva en el valor para que el catalogo lo rechace.
 */
export function propiedadesEscritas(props: readonly LayerProp[]): Array<{ clave: string; valor: string }> {
  return props.flatMap(({ key, value, second }) => {
    if (second === undefined) return [{ clave: key, valor: value }];
    if (key === 'offset') return [{ clave: 'offset-x', valor: value }, { clave: 'offset-y', valor: second }];
    return [{ clave: key, valor: `${value} ${second}` }];
  });
}

/** La propiedad escrita que origino `clave` (`offset-x` y `offset-y` salen de `offset`). */
export const propiedadDeClave = (props: readonly LayerProp[], clave: string): LayerProp | undefined =>
  props.find(({ key, second }) => key === clave || (key === 'offset' && second !== undefined && (clave === 'offset-x' || clave === 'offset-y')));

/** Sustituye los `$token`; cada propiedad conserva en `ref` la escrita que la origino. */
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

/** La clave si la propiedad no existe, el valor si existe pero no vale. */
export const inicioDePropiedad = (prop: LayerProp, error: ErrorDeCatalogo): { line: number; column: number } =>
  rangoDe(prop, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value').start;

export function aIssue(archivo: string, error: ErrorDeCatalogo, inicio: { line: number; column: number }): Issue {
  return { code: error.codigo, severity: 'error', file: archivo, ...inicio, message: error.mensaje, ...(error.hint !== undefined && { hint: error.hint }) };
}

/** Marcador, etiqueta o estilo de Slot; deja los errores en `ctx.issues`. */
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

/** `undefined` (con issue y `fix` por typo) si no es uno de `TIPOS_DE_DIAGRAMA`. */
export function nombreDeDiagrama(item: ThemeDiagram, archivo: string, issues: Issue[]): TipoDeDiagrama | undefined {
  const tipo = TIPOS_DE_DIAGRAMA.find((t) => t === item.name);
  if (tipo !== undefined) return tipo;
  issues.push(
    issueConSugerencia(
      { code: CODIGOS.E_THEME_UNKNOWN_DIAGRAM_TYPE, message: `Unknown Diagram type '${item.name}'; available: ${TIPOS_DE_DIAGRAMA.join(', ')}` },
      archivo, item, 'name', TIPOS_DE_DIAGRAMA,
    ),
  );
  return undefined;
}
