/**
 * Compilacion de la animacion declarativa de un Tema (ADR 0008): `motion` y
 * `keyframes` dentro de una Capa, y `transition`, `enter`, `exit` y `stagger`
 * del bloque `node`. Traduce el AST a parametros y delega validacion y
 * defectos en el catalogo de `tema`; aqui solo se situan los errores en el texto.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { ESTADOS, construirEfecto, construirEscalonado, construirKeyframes, construirMovimiento, construirTransicion, duracionEnMs } from 'tema';
import type { Animacion, AnimacionDeNodo, ErrorDeCatalogo, ParametroDeAnimacion } from 'tema';

import type { AnimParam, Duracion, NodeItem, ThemeEnter, ThemeExit, ThemeLayer, ThemeStagger, ThemeTransition } from './generated/ast';
import { aRango, rangoDe } from './posiciones';

type Ast = Parameters<typeof rangoDe>[0];

function aIssue(archivo: string, error: ErrorDeCatalogo, rango: TextRange): Issue {
  return {
    code: error.codigo,
    severity: 'error',
    file: archivo,
    ...rango.start,
    message: error.mensaje,
    ...(error.hint !== undefined && { hint: error.hint }),
  };
}

/** Pasa los parametros del AST a la forma del catalogo; una unidad desconocida es un error de valor. */
function leerParametros(params: readonly AnimParam[], archivo: string, issues: Issue[]): ParametroDeAnimacion[] {
  const salida: ParametroDeAnimacion[] = [];
  const duracion = (clave: string, d: Duracion): void => {
    const ms = duracionEnMs(d.amount, d.unit);
    if (ms === undefined) {
      issues.push(aIssue(archivo, { codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `Unidad '${d.unit}' desconocida en '${d.amount}${d.unit}'; usa 'ms' o 's'` }, rangoDe(d, 'unit')));
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

/** Resultado de compilar la animacion de una Capa: `null` quita la heredada, `undefined` no la toca. */
export interface AnimacionDeCapa {
  animacion?: Animacion | null;
  /** Hubo un error: el parche entero se descarta. */
  fallo: boolean;
}

export function compilarAnimacionDeCapa(item: ThemeLayer, archivo: string, issues: Issue[]): AnimacionDeCapa {
  const antes = issues.length;
  let animacion: Animacion | null | undefined;
  if (item.animations.length > 1) {
    issues.push(aIssue(archivo, { codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `La Capa '${item.name}' admite un solo 'motion' o 'keyframes'` }, aRango(item.animations[1]?.$cstNode?.range)));
  }
  const [anim] = item.animations;
  if (anim?.$type === 'ThemeMotion') {
    if (anim.remove) animacion = null;
    else {
      const params = leerParametros(anim.params, archivo, issues);
      const { animacion: hecha, errores } = construirMovimiento(anim.name ?? '', params);
      for (const e of errores) issues.push(aIssue(archivo, e, e.codigo === CODIGOS.E_THEME_UNKNOWN_MOTION ? rangoDe(anim, 'name') : aRango(anim.$cstNode?.range)));
      animacion = hecha;
    }
  } else if (anim?.$type === 'ThemeKeyframes') {
    const params = leerParametros(anim.params, archivo, issues);
    const pasos = anim.steps.map((paso) => ({ en: Number(paso.at), valor: Number(paso.value) }));
    const { animacion: hecha, errores } = construirKeyframes(anim.property, params, pasos);
    for (const e of errores) issues.push(aIssue(archivo, e, e.codigo === CODIGOS.E_THEME_UNKNOWN_MOTION ? rangoDe(anim, 'property') : aRango(anim.$cstNode?.range)));
    animacion = hecha;
  }
  return { ...(animacion !== undefined && { animacion }), fallo: issues.length > antes };
}

function transicionDe(item: ThemeTransition, archivo: string, issues: Issue[]) {
  const params = leerParametros(item.params, archivo, issues);
  const { animacion, errores } = construirTransicion(params);
  for (const e of errores) issues.push(aIssue(archivo, e, aRango(item.$cstNode?.range)));
  return animacion;
}

function efectoDe(item: ThemeEnter | ThemeExit, archivo: string, issues: Issue[]) {
  const params = leerParametros(item.params, archivo, issues);
  const { animacion, errores } = construirEfecto(item.effect, params);
  for (const e of errores) issues.push(aIssue(archivo, e, e.codigo === CODIGOS.E_THEME_UNKNOWN_MOTION ? rangoDe(item, 'effect') : aRango(item.$cstNode?.range)));
  return animacion;
}

function escalonadoDe(item: ThemeStagger, archivo: string, issues: Issue[]): number | undefined {
  const ms = duracionEnMs(item.amount.amount, item.amount.unit);
  if (ms === undefined) {
    issues.push(aIssue(archivo, { codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `Unidad '${item.amount.unit}' desconocida; usa 'ms' o 's'` }, rangoDe(item.amount, 'unit')));
    return undefined;
  }
  const { animacion, errores } = construirEscalonado(ms);
  for (const e of errores) issues.push(aIssue(archivo, e, aRango(item.$cstNode?.range)));
  return animacion;
}

const repetido = (archivo: string, que: string, item: Ast): Issue =>
  aIssue(archivo, { codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `'${que}' repetido en el mismo bloque` }, aRango(item.$cstNode?.range));

/**
 * Animacion del bloque `node` (`transition`, `enter`, `exit`, `stagger`) y
 * `transition` de cada `state`, sobre la heredada. Un elemento repetido en el
 * mismo bloque es un error.
 */
export function compilarAnimacionDeNodo(items: ReadonlyArray<NodeItem>, heredada: AnimacionDeNodo | undefined, archivo: string, issues: Issue[]): AnimacionDeNodo | undefined {
  const resultado: AnimacionDeNodo = { ...heredada, ...(heredada?.transicionesDeEstado !== undefined && { transicionesDeEstado: { ...heredada.transicionesDeEstado } }) };
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
      const estado = ESTADOS.find((e) => e === item.name);
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
