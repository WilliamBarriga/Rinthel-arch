/** Catalog of declarative animation. Only what does not touch the Metrics is animated. */
import { CODES } from 'canonical';

import { oldValueError, suggest } from './catalog';
import type { CatalogError } from './catalog';

export const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type Easing = (typeof EASINGS)[number];

/** `intensidad` says whether they accept the parameter. */
export const MOTIONS = {
  stream: { intensidad: false, easing: 'linear', duracionMs: 2000 },
  pulse: { intensidad: true, easing: 'ease-in-out', duracionMs: 1200 },
  breathe: { intensidad: true, easing: 'ease-in-out', duracionMs: 3000 },
  spin: { intensidad: false, easing: 'linear', duracionMs: 2000 },
  aura: { intensidad: true, easing: 'ease-in-out', duracionMs: 2000 },
} as const satisfies Record<string, { intensidad: boolean; easing: Easing; duracionMs: number }>;
export type MotionName = keyof typeof MOTIONS;

export const EFFECTS = ['fade', 'zoom', 'slide'] as const;
export type EffectName = (typeof EFFECTS)[number];

export const ANIMATABLE_PROPERTIES = {
  opacity: { min: 0, max: 1 },
  scale: { min: 0, max: 4 },
  rotate: { min: -360, max: 360 },
  'shift-x': { min: -200, max: 200 },
  'shift-y': { min: -200, max: 200 },
  blur: { min: 0, max: 32 },
} as const satisfies Record<string, { min: number; max: number }>;
export type AnimatableProperty = keyof typeof ANIMATABLE_PROPERTIES;

export type Reduced = 'still' | 'fade' | 'instant';

interface Timing {
  duracionMs: number;
  easing: Easing;
  retardoMs: number;
}

/** With reduced-motion it stays on its static frame. */
export interface Motion extends Timing {
  clase: 'movimiento';
  movimiento: MotionName;
  intensidad?: number;
  reducido: 'still';
}

export interface KeyframesStep {
  /** Percentage 0..100 of the duration. */
  en: number;
  valor: number;
}

export interface LayerKeyframes extends Timing {
  clase: 'keyframes';
  propiedad: AnimatableProperty;
  pasos: KeyframesStep[];
  reducido: 'still';
}

export type Animation = Motion | LayerKeyframes;

export interface Transition {
  duracionMs: number;
  easing: Easing;
  reducido: 'fade' | 'instant';
}

export interface Effect extends Timing {
  efecto: EffectName;
  reducido: 'fade' | 'instant';
}

/** `duration` and `delay` already in ms. */
export interface AnimationParameter {
  clave: string;
  valor: string | number;
}

interface Result<T> {
  animacion?: T;
  errores: CatalogError[];
}

const UNITS: Record<string, number> = { ms: 1, s: 1000 };

/** `unit` is `ms` or `s`; `undefined` if the unit does not exist. */
export function durationMs(count: string, unit: string): number | undefined {
  const factor = UNITS[unit];
  return factor === undefined || Number.isNaN(Number(count)) ? undefined : Math.round(Number(count) * factor);
}

const invalid = (message: string, key: string): CatalogError => ({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: message, clave: key });

const toNumber = (value: string | number): number => (typeof value === 'number' ? value : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN);

interface Spec {
  nombre: string;
  duracionMs: number;
  easing: Easing;
  intensidad: boolean;
  reducidos: readonly Reduced[];
  conRetardo: boolean;
}

function readParameters(
  spec: Spec,
  params: readonly AnimationParameter[],
): { tiempo: Timing; intensidad: number | undefined; reducido: Reduced; errores: CatalogError[] } {
  const errors: CatalogError[] = [];
  const timing: Timing = { duracionMs: spec.duracionMs, easing: spec.easing, retardoMs: 0 };
  let intensity: number | undefined = spec.intensidad ? 0.5 : undefined;
  let reduced: Reduced = spec.reducidos[0] as Reduced;
  const allowed = ['duration', 'easing', 'reduced', ...(spec.conRetardo ? ['delay'] : []), ...(spec.intensidad ? ['intensity'] : [])];
  for (const { clave: key, valor: value } of params) {
    if (!allowed.includes(key)) {
      errors.push({
        codigo: CODES.E_THEME_UNKNOWN_PROPERTY,
        mensaje: `'${spec.nombre}' does not support '${key}'; available: ${allowed.join(', ')}`,
        clave: key,
        ...suggest(key, allowed),
      });
    } else if (key === 'duration' || key === 'delay') {
      const ms = toNumber(value);
      const min = key === 'duration' ? 1 : 0;
      const max = key === 'duration' ? 60000 : 10000;
      if (Number.isNaN(ms) || ms < min || ms > max) errors.push(invalid(`'${key}' of '${spec.nombre}' must be between ${min} and ${max} ms, not '${value}'`, key));
      else if (key === 'duration') timing.duracionMs = ms;
      else timing.retardoMs = ms;
    } else if (key === 'easing') {
      if ((EASINGS as readonly string[]).includes(String(value))) timing.easing = value as Easing;
      else errors.push({ ...invalid(`Unknown easing '${value}'; available: ${EASINGS.join(', ')}`, key), ...suggest(String(value), EASINGS) });
    } else if (key === 'intensity') {
      const n = toNumber(value);
      if (Number.isNaN(n) || n < 0 || n > 1) errors.push(invalid(`'intensity' of '${spec.nombre}' must be a number between 0 and 1, not '${value}'`, key));
      else intensity = n;
    } else if ((spec.reducidos as readonly string[]).includes(String(value))) reduced = value as Reduced;
    else errors.push(invalid(`'reduced' of '${spec.nombre}' only accepts ${spec.reducidos.join(' or ')}, not '${value}'`, key));
  }
  return { tiempo: timing, intensidad: intensity, reducido: reduced, errores: errors };
}

export function buildMotion(name: string, params: readonly AnimationParameter[]): Result<Motion> {
  if (!Object.hasOwn(MOTIONS, name)) {
    const old = oldValueError('motion', name);
    if (old !== undefined) return { errores: [old] };
    return {
      errores: [
        {
          codigo: CODES.E_THEME_UNKNOWN_MOTION,
          mensaje: `Unknown Motion '${name}'; available: ${Object.keys(MOTIONS).join(', ')}`,
          ...suggest(name, Object.keys(MOTIONS)),
        },
      ],
    };
  }
  const definition: { intensidad: boolean; easing: Easing; duracionMs: number } = MOTIONS[name as MotionName];
  const { tiempo: timing, intensidad: intensity, errores: errors } = readParameters(
    { nombre: name, duracionMs: definition.duracionMs, easing: definition.easing, intensidad: definition.intensidad, reducidos: ['still'], conRetardo: true },
    params,
  );
  if (errors.length > 0) return { errores: errors };
  return {
    animacion: { clase: 'movimiento', movimiento: name as MotionName, ...timing, ...(intensity !== undefined && { intensidad: intensity }), reducido: 'still' },
    errores: errors,
  };
}

export function buildKeyframes(property: string, params: readonly AnimationParameter[], steps: readonly KeyframesStep[]): Result<LayerKeyframes> {
  if (!Object.hasOwn(ANIMATABLE_PROPERTIES, property)) {
    return {
      errores: [
        {
          codigo: CODES.E_THEME_UNKNOWN_MOTION,
          mensaje: `Unknown animatable property '${property}'; only what does not touch the Metrics can be animated: ${Object.keys(ANIMATABLE_PROPERTIES).join(', ')}`,
          ...suggest(property, Object.keys(ANIMATABLE_PROPERTIES)),
        },
      ],
    };
  }
  const range = ANIMATABLE_PROPERTIES[property as AnimatableProperty];
  const { tiempo: timing, errores: errors } = readParameters({ nombre: 'keyframes', duracionMs: 1000, easing: 'ease-in-out', intensidad: false, reducidos: ['still'], conRetardo: true }, params);
  if (steps.length < 2) errors.push(invalid(`'keyframes ${property}' needs at least two steps`, 'pasos'));
  steps.forEach((step, i) => {
    if (step.en < 0 || step.en > 100 || (i > 0 && step.en <= (steps[i - 1] as KeyframesStep).en)) {
      errors.push(invalid(`Step ${step.en} of 'keyframes ${property}' must be between 0 and 100 and increase over the previous one`, 'pasos'));
    }
    if (step.valor < range.min || step.valor > range.max) {
      errors.push(invalid(`Value ${step.valor} of '${property}' must be between ${range.min} and ${range.max}`, 'pasos'));
    }
  });
  if (errors.length > 0) return { errores: errors };
  return { animacion: { clase: 'keyframes', propiedad: property as AnimatableProperty, pasos: steps.map((p) => ({ ...p })), ...timing, reducido: 'still' }, errores: errors };
}

export function buildTransition(params: readonly AnimationParameter[]): Result<Transition> {
  const { tiempo: timing, reducido: reduced, errores: errors } = readParameters({ nombre: 'transition', duracionMs: 150, easing: 'ease', intensidad: false, reducidos: ['fade', 'instant'], conRetardo: false }, params);
  if (errors.length > 0) return { errores: errors };
  return { animacion: { duracionMs: timing.duracionMs, easing: timing.easing, reducido: reduced as 'fade' | 'instant' }, errores: errors };
}

export function buildEffect(name: string, params: readonly AnimationParameter[]): Result<Effect> {
  if (!(EFFECTS as readonly string[]).includes(name)) {
    const old = oldValueError('effect', name);
    if (old !== undefined) return { errores: [old] };
    return {
      errores: [
        {
          codigo: CODES.E_THEME_UNKNOWN_MOTION,
          mensaje: `Unknown effect '${name}'; available: ${EFFECTS.join(', ')}`,
          ...suggest(name, EFFECTS),
        },
      ],
    };
  }
  const { tiempo: timing, reducido: reduced, errores: errors } = readParameters({ nombre: name, duracionMs: 300, easing: 'ease-out', intensidad: false, reducidos: ['fade', 'instant'], conRetardo: true }, params);
  if (errors.length > 0) return { errores: errors };
  return { animacion: { efecto: name as EffectName, ...timing, reducido: reduced as 'fade' | 'instant' }, errores: errors };
}

/** `stagger` in ms. */
export function buildStagger(ms: number): Result<number> {
  return ms >= 0 && ms <= 2000 ? { animacion: ms, errores: [] } : { errores: [invalid(`'stagger' must be between 0 and 2000 ms, not '${ms}'`, 'duration')] };
}
