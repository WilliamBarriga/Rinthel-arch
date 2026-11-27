/** Animation of a Theme; validation and defaults belong to the `theme` catalog. */
import { CODES, renameIssue } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { buildEffect, buildStagger, buildKeyframes, buildMotion, buildTransition, durationMs, parseState } from 'theme';
import type { Animation, NodeAnimation, CatalogError, AnimationParameter } from 'theme';

import type { AnimParam, Duration, NodeItem, ThemeEnter, ThemeExit, ThemeLayer, ThemeStagger, ThemeTransition } from './generated/ast';
import { toRange, rangeOf } from './positions';
import { themeIssue as situar } from './themes-common';

type Ast = Parameters<typeof rangeOf>[0];

const toIssue = (file: string, error: CatalogError, range: TextRange): Issue =>
  error.codigo === CODES.E_OLD_CATALOG_VALUE && error.candidato !== undefined ? renameIssue(error.codigo, error.mensaje, file, range, error.candidato) : situar(file, error, range.start);

/** An unknown or old name is located on the name; the rest, on the whole element. */
const isNameError = (error: CatalogError): boolean => error.codigo === CODES.E_THEME_UNKNOWN_MOTION || error.codigo === CODES.E_OLD_CATALOG_VALUE;

/** An unknown unit is a value error. */
function readParams(params: readonly AnimParam[], file: string, issues: Issue[]): AnimationParameter[] {
  const output: AnimationParameter[] = [];
  const duration = (key: string, d: Duration): void => {
    const ms = durationMs(d.amount, d.unit);
    if (ms === undefined) {
      issues.push(toIssue(file, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Unknown unit '${d.unit}' in '${d.amount}${d.unit}'; use 'ms' or 's'` }, rangeOf(d, 'unit')));
    } else output.push({ clave: key, valor: ms });
  };
  for (const param of params) {
    if (param.duration !== undefined) duration('duration', param.duration);
    if (param.delay !== undefined) duration('delay', param.delay);
    if (param.intensity !== undefined) output.push({ clave: 'intensity', valor: param.intensity });
    if (param.reduced !== undefined) output.push({ clave: 'reduced', valor: param.reduced });
    if (param.easing !== undefined) output.push({ clave: 'easing', valor: param.easing });
  }
  return output;
}

/** `null` removes the inherited one, `undefined` leaves it alone. */
export interface LayerAnimationResult {
  animacion?: Animation | null;
  /** There was an error: the whole patch is discarded. */
  failed: boolean;
}

export function compileLayerAnimation(item: ThemeLayer, file: string, issues: Issue[]): LayerAnimationResult {
  const before = issues.length;
  let animation: Animation | null | undefined;
  if (item.animations.length > 1) {
    issues.push(toIssue(file, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Layer '${item.name}' accepts a single 'motion' or 'keyframes'` }, toRange(item.animations[1]?.$cstNode?.range)));
  }
  const [anim] = item.animations;
  if (anim?.$type === 'ThemeMotion') {
    if (anim.remove) animation = null;
    else {
      const params = readParams(anim.params, file, issues);
      const { animacion: done, errores: errors } = buildMotion(anim.name ?? '', params);
      for (const e of errors) issues.push(toIssue(file, e, isNameError(e) ? rangeOf(anim, 'name') : toRange(anim.$cstNode?.range)));
      animation = done;
    }
  } else if (anim?.$type === 'ThemeKeyframes') {
    const params = readParams(anim.params, file, issues);
    const stepList = anim.steps.map((step) => ({ en: Number(step.at), valor: Number(step.value) }));
    const { animacion: done, errores: errors } = buildKeyframes(anim.property, params, stepList);
    for (const e of errors) issues.push(toIssue(file, e, isNameError(e) ? rangeOf(anim, 'property') : toRange(anim.$cstNode?.range)));
    animation = done;
  }
  return { ...(animation !== undefined && { animacion: animation }), failed: issues.length > before };
}

function transitionOf(item: ThemeTransition, file: string, issues: Issue[]) {
  const params = readParams(item.params, file, issues);
  const { animacion: animation, errores: errors } = buildTransition(params);
  for (const e of errors) issues.push(toIssue(file, e, toRange(item.$cstNode?.range)));
  return animation;
}

function effectOf(item: ThemeEnter | ThemeExit, file: string, issues: Issue[]) {
  const params = readParams(item.params, file, issues);
  const { animacion: animation, errores: errors } = buildEffect(item.effect, params);
  for (const e of errors) issues.push(toIssue(file, e, isNameError(e) ? rangeOf(item, 'effect') : toRange(item.$cstNode?.range)));
  return animation;
}

function staggerOf(item: ThemeStagger, file: string, issues: Issue[]): number | undefined {
  const ms = durationMs(item.amount.amount, item.amount.unit);
  if (ms === undefined) {
    issues.push(toIssue(file, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Unknown unit '${item.amount.unit}'; use 'ms' or 's'` }, rangeOf(item.amount, 'unit')));
    return undefined;
  }
  const { animacion: animation, errores: errors } = buildStagger(ms);
  for (const e of errors) issues.push(toIssue(file, e, toRange(item.$cstNode?.range)));
  return animation;
}

const repeated = (file: string, what: string, item: Ast): Issue =>
  toIssue(file, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `'${what}' repeated in the same block` }, toRange(item.$cstNode?.range));

/** Over the inherited one; an element repeated in the same block is an error. */
export function compileNodeAnimation(items: ReadonlyArray<NodeItem>, inherited: NodeAnimation | undefined, file: string, issues: Issue[]): NodeAnimation | undefined {
  const result: NodeAnimation = { ...inherited, ...(inherited?.transicionesDeEstado !== undefined && { transicionesDeEstado: { ...inherited.transicionesDeEstado } }) };
  const seen = new Set<string>();
  const single = (what: string, item: Ast): boolean => {
    if (seen.has(what)) {
      issues.push(repeated(file, what, item));
      return false;
    }
    seen.add(what);
    return true;
  };
  for (const item of items) {
    if (item.$type === 'ThemeTransition' && single('transition', item)) {
      const t = transitionOf(item, file, issues);
      if (t !== undefined) result.transicion = t;
    } else if (item.$type === 'ThemeEnter' && single('enter', item)) {
      const e = effectOf(item, file, issues);
      if (e !== undefined) result.entrada = e;
    } else if (item.$type === 'ThemeExit' && single('exit', item)) {
      const e = effectOf(item, file, issues);
      if (e !== undefined) result.salida = e;
    } else if (item.$type === 'ThemeStagger' && single('stagger', item)) {
      const ms = staggerOf(item, file, issues);
      if (ms !== undefined) result.escalonadoMs = ms;
    } else if (item.$type === 'ThemeState') {
      const parsed = parseState(item.name);
      const state = 'estado' in parsed ? parsed.estado : undefined;
      const transitions = item.items.filter((i): i is ThemeTransition => i.$type === 'ThemeTransition');
      transitions.forEach((transition, i) => {
        if (i > 0) issues.push(repeated(file, 'transition', transition));
        const t = transitionOf(transition, file, issues);
        if (t !== undefined && state !== undefined && i === 0) result.transicionesDeEstado = { ...result.transicionesDeEstado, [state]: t };
      });
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}
