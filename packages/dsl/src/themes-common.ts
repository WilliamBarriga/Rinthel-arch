/** Common pieces of Theme compilation: context, written properties and catalog errors as Issues. */
import { CODES } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { DIAGRAM_TYPES, buildPrimitive, resolveTokens } from 'theme';
import type { CatalogError, Primitive, WrittenProperty, DiagramType, PrimitivePlacement } from 'theme';

import type { LayerProp, PartDecl, ThemeDiagram } from './generated/ast';
import { issueWithSuggestion, rangeOf } from './positions';

export interface DeclaredPart {
  file: string;
  ast: PartDecl;
  name: TextRange;
}

export interface Context {
  file: string;
  parts: ReadonlyMap<string, DeclaredPart>;
  palette: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  issues: Issue[];
}

/**
 * `offset x y` expands to `offset-x` and `offset-y`; a second value on any other key is
 * kept in the value so the catalog rejects it.
 */
export function writtenProperties(props: readonly LayerProp[]): Array<{ clave: string; valor: string }> {
  return props.flatMap(({ key, value, second }) => {
    if (second === undefined) return [{ clave: key, valor: value }];
    if (key === 'offset') return [{ clave: 'offset-x', valor: value }, { clave: 'offset-y', valor: second }];
    return [{ clave: key, valor: `${value} ${second}` }];
  });
}

/** The written property `key` came from (`offset-x` and `offset-y` come from `offset`). */
export const keyProperty = (props: readonly LayerProp[], propKey: string): LayerProp | undefined =>
  props.find(({ key, second }) => key === propKey || (key === 'offset' && second !== undefined && (propKey === 'offset-x' || propKey === 'offset-y')));

/** Replaces the `$token`s; each property keeps in `ref` the written one it came from. */
export function resolvedProperties(list: readonly LayerProp[], tokens: Readonly<Record<string, string>>): { props: Array<WrittenProperty<LayerProp>>; errores: CatalogError[] } {
  const { props, errores: errors } = resolveTokens(writtenProperties(list), tokens);
  return {
    props: props.flatMap(({ clave: key, valor: value }) => {
      const ref = keyProperty(list, key);
      return ref === undefined ? [] : [{ clave: key, valor: value, ref }];
    }),
    errores: errors,
  };
}

/** The key if the property does not exist, the value if it exists but is not valid. */
export const propertyStart = (prop: LayerProp, error: CatalogError): { line: number; column: number } =>
  rangeOf(prop, error.codigo === CODES.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value').start;

export function themeIssue(file: string, error: CatalogError, start: { line: number; column: number }): Issue {
  return { code: error.codigo, severity: 'error', file, ...start, message: error.mensaje, ...(error.hint !== undefined && { hint: error.hint }) };
}

/** Marker, label or Slot style; leaves the errors in `ctx.issues`. */
export function looseFamily(
  kind: string,
  props: readonly LayerProp[],
  placement: PrimitivePlacement,
  ctx: Context,
  culprit: { line: number; column: number },
): Primitive | undefined {
  const resolvedList = resolvedProperties(props, ctx.tokens);
  const { primitiva: primitive, errores: errors } = buildPrimitive(kind, resolvedList.props, ctx.palette, placement);
  for (const error of [...resolvedList.errores, ...errors]) {
    const prop = error.clave === undefined ? undefined : keyProperty(props, error.clave);
    ctx.issues.push(themeIssue(ctx.file, error, prop !== undefined ? propertyStart(prop, error) : culprit));
  }
  return resolvedList.errores.length === 0 && errors.length === 0 ? primitive : undefined;
}

/** `undefined` (with an issue and a typo `fix`) if it is not one of the Diagram types. */
export function diagramName(item: ThemeDiagram, file: string, issues: Issue[]): DiagramType | undefined {
  const kind = DIAGRAM_TYPES.find((t) => t === item.name);
  if (kind !== undefined) return kind;
  issues.push(
    issueWithSuggestion(
      { code: CODES.E_THEME_UNKNOWN_DIAGRAM_TYPE, message: `Unknown Diagram type '${item.name}'; available: ${DIAGRAM_TYPES.join(', ')}` },
      file, item, 'name', DIAGRAM_TYPES,
    ),
  );
  return undefined;
}
