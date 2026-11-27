/** Animacion de un Tema; la validacion y los defectos son del catalogo de `theme`. */
import { CODES, renameIssue } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { buildEffect, buildStagger, buildKeyframes, buildMotion, buildTransition, durationMs, parseState } from 'theme';
import type { Animation, NodeAnimation, CatalogError, AnimationParameter } from 'theme';

import type { AnimParam, Duracion, NodeItem, ThemeEnter, ThemeExit, ThemeLayer, ThemeStagger, ThemeTransition } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { aIssue as situar } from './temas-comun';

type Ast = Parameters<typeof rangoDe>[0];

const aIssue = (archivo: string, error: CatalogError, rango: TextRange): Issue =>
  error.codigo === CODES.E_OLD_CATALOG_VALUE && error.candidato !== undefined ? renameIssue(error.codigo, error.mensaje, archivo, rango, error.candidato) : situar(archivo, error, rango.start);

/** Un nombre desconocido o antiguo se situa en el nombre; el resto, en todo el elemento. */
const esErrorDeNombre = (error: CatalogError): boolean => error.codigo === CODES.E_THEME_UNKNOWN_MOTION || error.codigo === CODES.E_OLD_CATALOG_VALUE;

/** Una unidad desconocida es un error de valor. */
function leerParametros(params: readonly AnimParam[], archivo: string, issues: Issue[]): AnimationParameter[] {
  const salida: AnimationParameter[] = [];
  const duracion = (clave: string, d: Duracion): void => {
    const ms = durationMs(d.amount, d.unit);
    if (ms === undefined) {
      issues.push(aIssue(archivo, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Unknown unit '${d.unit}' in '${d.amount}${d.unit}'; use 'ms' or 's'` }, rangoDe(d, 'unit')));
    } else salida.push({ clave, valor: ms });
  };
  for (const param of params) {
    if (param.duration !== undefined) duracion('duration', param.duration);
    if (param.delay !== undefined) duracion('delay', param.delay);
    if (param.intensity !== undefined) salida.push({ clave: 'intensity', valor: param.intensity });
    if (param.reduced !== undefined) salida.push({ clave: 'reduced', valor: param.reduced });
    if (param.easing !== undefined) salida.push({ clave: 'easing', valor: param.easing });
  }
  return salida;
}

/** `null` quita la heredada, `undefined` no la toca. */
export interface AnimacionDeCapa {
  animacion?: Animation | null;
  /** Hubo un error: el parche entero se descarta. */
  fallo: boolean;
}

export function compilarAnimacionDeCapa(item: ThemeLayer, archivo: string, issues: Issue[]): AnimacionDeCapa {
  const antes = issues.length;
  let animacion: Animation | null | undefined;
  if (item.animations.length > 1) {
    issues.push(aIssue(archivo, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Layer '${item.name}' accepts a single 'motion' or 'keyframes'` }, aRango(item.animations[1]?.$cstNode?.range)));
  }
  const [anim] = item.animations;
  if (anim?.$type === 'ThemeMotion') {
    if (anim.remove) animacion = null;
    else {
      const params = leerParametros(anim.params, archivo, issues);
      const { animacion: hecha, errores } = buildMotion(anim.name ?? '', params);
      for (const e of errores) issues.push(aIssue(archivo, e, esErrorDeNombre(e) ? rangoDe(anim, 'name') : aRango(anim.$cstNode?.range)));
      animacion = hecha;
    }
  } else if (anim?.$type === 'ThemeKeyframes') {
    const params = leerParametros(anim.params, archivo, issues);
    const pasos = anim.steps.map((paso) => ({ en: Number(paso.at), valor: Number(paso.value) }));
    const { animacion: hecha, errores } = buildKeyframes(anim.property, params, pasos);
    for (const e of errores) issues.push(aIssue(archivo, e, esErrorDeNombre(e) ? rangoDe(anim, 'property') : aRango(anim.$cstNode?.range)));
    animacion = hecha;
  }
  return { ...(animacion !== undefined && { animacion }), fallo: issues.length > antes };
}

function transicionDe(item: ThemeTransition, archivo: string, issues: Issue[]) {
  const params = leerParametros(item.params, archivo, issues);
  const { animacion, errores } = buildTransition(params);
  for (const e of errores) issues.push(aIssue(archivo, e, aRango(item.$cstNode?.range)));
  return animacion;
}

function efectoDe(item: ThemeEnter | ThemeExit, archivo: string, issues: Issue[]) {
  const params = leerParametros(item.params, archivo, issues);
  const { animacion, errores } = buildEffect(item.effect, params);
  for (const e of errores) issues.push(aIssue(archivo, e, esErrorDeNombre(e) ? rangoDe(item, 'effect') : aRango(item.$cstNode?.range)));
  return animacion;
}

function escalonadoDe(item: ThemeStagger, archivo: string, issues: Issue[]): number | undefined {
  const ms = durationMs(item.amount.amount, item.amount.unit);
  if (ms === undefined) {
    issues.push(aIssue(archivo, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `Unknown unit '${item.amount.unit}'; use 'ms' or 's'` }, rangoDe(item.amount, 'unit')));
    return undefined;
  }
  const { animacion, errores } = buildStagger(ms);
  for (const e of errores) issues.push(aIssue(archivo, e, aRango(item.$cstNode?.range)));
  return animacion;
}

const repetido = (archivo: string, que: string, item: Ast): Issue =>
  aIssue(archivo, { codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `'${que}' repeated in the same block` }, aRango(item.$cstNode?.range));

/** Sobre la heredada; un elemento repetido en el mismo bloque es un error. */
export function compilarAnimacionDeNodo(items: ReadonlyArray<NodeItem>, heredada: NodeAnimation | undefined, archivo: string, issues: Issue[]): NodeAnimation | undefined {
  const resultado: NodeAnimation = { ...heredada, ...(heredada?.transicionesDeEstado !== undefined && { transicionesDeEstado: { ...heredada.transicionesDeEstado } }) };
  const vistos = new Set<string>();
  const unico = (que: string, item: Ast): boolean => {
    if (vistos.has(que)) {
      issues.push(repetido(archivo, que, item));
      return false;
    }
    vistos.add(que);
    return true;
  };
  for (const item of items) {
    if (item.$type === 'ThemeTransition' && unico('transition', item)) {
      const t = transicionDe(item, archivo, issues);
      if (t !== undefined) resultado.transicion = t;
    } else if (item.$type === 'ThemeEnter' && unico('enter', item)) {
      const e = efectoDe(item, archivo, issues);
      if (e !== undefined) resultado.entrada = e;
    } else if (item.$type === 'ThemeExit' && unico('exit', item)) {
      const e = efectoDe(item, archivo, issues);
      if (e !== undefined) resultado.salida = e;
    } else if (item.$type === 'ThemeStagger' && unico('stagger', item)) {
      const ms = escalonadoDe(item, archivo, issues);
      if (ms !== undefined) resultado.escalonadoMs = ms;
    } else if (item.$type === 'ThemeState') {
      const parseado = parseState(item.name);
      const estado = 'estado' in parseado ? parseado.estado : undefined;
      const transiciones = item.items.filter((i): i is ThemeTransition => i.$type === 'ThemeTransition');
      transiciones.forEach((transicion, i) => {
        if (i > 0) issues.push(repetido(archivo, 'transition', transicion));
        const t = transicionDe(transicion, archivo, issues);
        if (t !== undefined && estado !== undefined && i === 0) resultado.transicionesDeEstado = { ...resultado.transicionesDeEstado, [estado]: t };
      });
    }
  }
  return Object.keys(resultado).length === 0 ? undefined : resultado;
}
