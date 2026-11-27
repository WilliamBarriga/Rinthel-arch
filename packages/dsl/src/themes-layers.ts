/**
 * Block of Layer patches (Theme, `type`, `state`, `part` or View override): expands `use`, resolves `$token`
 * and validates against the catalog and the current stack. The semantics of applying patches lives in `theme`.
 */
import { CODES } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { validateOps } from 'theme';
import type { ResolvedLayer, CatalogError, LayerOp, PrimitivePlacement } from 'theme';

import type { ThemeLayer, ThemeUse } from './generated/ast';
import { toRange, issueWithSuggestion, rangeOf } from './positions';
import { compileLayerAnimation } from './themes-animation';
import type { LayerAnimationResult } from './themes-animation';
import { keyProperty, resolvedProperties } from './themes-common';
import type { Context } from './themes-common';

/** Where a Layer was last defined; used as `related`. */
export interface Site {
  file: string;
  line: number;
  column: number;
}

export interface BlockContext extends Context {
  /** `definir` only in the first block of a Theme without inherited Layers. */
  mode: 'definir' | 'parchear';
  /** Where the block's Layers are used; `capa-nodo` if missing. */
  placement?: PrimitivePlacement;
  /** Stacks the block can apply over; it is enough that it is valid for one. */
  candidates: ReadonlyArray<readonly ResolvedLayer[]>;
  /** Site of each Layer of the base stack; the block updates it with what it defines. */
  origins: Map<string, Site>;
}

interface LayerEntry {
  item: ThemeLayer;
  file: string;
  /** Written in the block itself (not coming from a `part`): only these count for duplicates. */
  direct: boolean;
}

function expand(items: ReadonlyArray<ThemeLayer | ThemeUse>, file: string, ctx: BlockContext, used: ReadonlySet<string>, direct: boolean): LayerEntry[] {
  return items.flatMap((item): LayerEntry[] => {
    if (item.$type === 'ThemeLayer') return [{ item, file, direct }];
    const part = ctx.parts.get(item.name);
    if (part === undefined) {
      ctx.issues.push(
        issueWithSuggestion(
          { code: CODES.E_THEME_UNKNOWN_PART, message: `Part '${item.name}' is not declared; use 'part ${item.name} { ... }'` },
          file, item, 'name', ctx.parts.keys(),
        ),
      );
      return [];
    }
    if (used.has(item.name)) return [];
    return expand(part.ast.items, part.file, ctx, new Set([...used, item.name]), false);
  });
}

const siteOf = (file: string, range: TextRange): Site => ({ file, ...range.start });

function toOp(element: LayerEntry, ctx: BlockContext): { op: LayerOp; errores: CatalogError[] } {
  const { item } = element;
  const { props, errores: errors } = resolvedProperties(item.props, ctx.tokens);
  const op: LayerOp = {
    nombre: item.name,
    props: Object.fromEntries(props.map(({ clave: key, valor: value }) => [key, value])),
    ...(item.remove === true && { quitar: true as const }),
    ...(item.primitive !== undefined && { primitiva: item.primitive }),
    ...(item.placement === 'before' && { antes: item.target }),
    ...(item.placement === 'after' && { despues: item.target }),
    ...(item.over === true && { encima: true as const }),
  };
  return { op, errores: errors };
}

/** The page background is not animated: `motion` and `keyframes` in `page` are an error. */
function rejectPageAnimation(item: ThemeLayer, file: string, issues: Issue[]): LayerAnimationResult {
  const [anim] = item.animations;
  if (anim === undefined) return { failed: false };
  issues.push({
    code: CODES.E_THEME_INVALID_VALUE,
    severity: 'error',
    file: file,
    ...toRange(anim.$cstNode?.range).start,
    message: `Layer '${item.name}' of 'page' does not accept '${anim.$type === 'ThemeMotion' ? 'motion' : 'keyframes'}': the page background is not animated`,
    hint: "Animate the Layers of 'node' or 'group'; 'page' is static paint only",
  });
  return { failed: true };
}

/** Returns the patches without errors in application order; the issues end up in `ctx.issues`. */
export function compileBlock(items: ReadonlyArray<ThemeLayer | ThemeUse>, ctx: BlockContext): LayerOp[] {
  const elements = expand(items, ctx.file, ctx, new Set(), true);
  const base = new Map(ctx.origins);

  const viewList = new Set<string>();
  const uniques = elements.filter(({ item, file, direct }) => {
    if (!direct || !viewList.has(item.name)) {
      if (direct) viewList.add(item.name);
      return true;
    }
    ctx.issues.push({
      code: CODES.E_THEME_DUPLICATE_LAYER,
      severity: 'error',
      file: file,
      ...rangeOf(item, 'name').start,
      message: `Layer '${item.name}' repeated in the same block`,
    });
    return false;
  });

  const compiledList = uniques.map((element) => {
    const fromOp = toOp(element, ctx);
    const animated = ctx.placement === 'capa-pagina' ? rejectPageAnimation(element.item, element.file, ctx.issues) : compileLayerAnimation(element.item, element.file, ctx.issues);
    if (animated.animacion !== undefined) fromOp.op.animacion = animated.animacion;
    return { elemento: element, ...fromOp, animacionFalla: animated.failed };
  });
  const issueOf = (element: LayerEntry, error: CatalogError, where: 'nombre' | 'ubicacion' | 'propiedad', errorBase?: string): Issue => {
    const { item, file } = element;
    const prop = error.clave === undefined ? undefined : keyProperty(item.props, error.clave);
    const range =
      where === 'ubicacion'
        ? rangeOf(item, 'target')
        : where === 'propiedad' && prop !== undefined
          ? rangeOf(prop, error.codigo === CODES.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value')
          : rangeOf(item, error.codigo === CODES.E_THEME_UNKNOWN_PRIMITIVE ? 'primitive' : 'name');
    const origin = errorBase === undefined ? undefined : base.get(errorBase);
    // A single close candidate gives a `fix` instead of a `hint`; tokens (with `$`) are not fixed.
    const fixable = error.candidato !== undefined && error.codigo !== CODES.E_THEME_UNKNOWN_TOKEN;
    return {
      code: error.codigo,
      severity: 'error',
      file: file,
      ...range.start,
      message: error.mensaje,
      ...(fixable ? { fix: { file, range, replacement: error.candidato as string } } : error.hint !== undefined && { hint: error.hint }),
      ...(origin !== undefined && { related: [{ ...origin, message: `base Layer '${errorBase}' that this patch modifies` }] }),
    };
  };

  for (const { elemento: element, errores: errors } of compiledList) {
    for (const error of errors) ctx.issues.push(issueOf(element, error, 'propiedad'));
  }
  const ops = compiledList.map(({ op }) => op);
  const failedList = new Set<number>();
  compiledList.forEach(({ animacionFalla: animationFailed }, i) => {
    if (animationFailed) failedList.add(i);
  });
  for (const error of validateOps(ctx.candidates, ops, ctx.palette, ctx.mode, ctx.placement)) {
    failedList.add(error.indice);
    ctx.issues.push(issueOf((compiledList[error.indice] as { elemento: LayerEntry }).elemento, error, error.donde, error.base));
  }

  const validOnes: LayerOp[] = [];
  compiledList.forEach(({ elemento: element, op }, i) => {
    if (failedList.has(i)) return;
    validOnes.push(op);
    if (op.quitar === true) ctx.origins.delete(op.nombre);
    else ctx.origins.set(op.nombre, siteOf(element.file, rangeOf(element.item, 'name')));
  });
  return validOnes;
}
