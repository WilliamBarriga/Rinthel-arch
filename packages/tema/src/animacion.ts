/**
 * Catalogo de animacion declarativa (ADR 0008): Movimientos de Capa, `keyframes`
 * minimos, `transition` entre estados y efectos de `enter`/`exit`. Como el
 * catalogo de Primitivas, es la fuente unica de validacion y mensajes; el
 * pintor (CSS) vive en `render`. Solo se anima lo que no toca las Metricas:
 * opacidad, color, transform, desplazamiento, blur y glow. Puro.
 */
import { CODIGOS } from 'canonico';

import { sugerir } from './catalogo';
import type { ErrorDeCatalogo } from './catalogo';

export const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type Easing = (typeof EASINGS)[number];

/** Movimientos continuos de catalogo; `intensidad` dice si admiten el parametro. */
export const MOVIMIENTOS = {
  flujo: { intensidad: false, easing: 'linear', duracionMs: 2000 },
  pulso: { intensidad: true, easing: 'ease-in-out', duracionMs: 1200 },
  respiracion: { intensidad: true, easing: 'ease-in-out', duracionMs: 3000 },
  giro: { intensidad: false, easing: 'linear', duracionMs: 2000 },
  aura: { intensidad: true, easing: 'ease-in-out', duracionMs: 2000 },
} as const satisfies Record<string, { intensidad: boolean; easing: Easing; duracionMs: number }>;
export type NombreDeMovimiento = keyof typeof MOVIMIENTOS;

/** Efectos de `enter`/`exit` de un Nodo (`dibujar-trazo` llega con el modelo de Arista). */
export const EFECTOS = ['fundido', 'escala', 'deslizar'] as const;
export type NombreDeEfecto = (typeof EFECTOS)[number];

/** Propiedades que `keyframes` puede animar, con su rango. Ninguna cambia la caja. */
export const PROPIEDADES_ANIMABLES = {
  opacity: { min: 0, max: 1 },
  scale: { min: 0, max: 4 },
  rotate: { min: -360, max: 360 },
  'shift-x': { min: -200, max: 200 },
  'shift-y': { min: -200, max: 200 },
  blur: { min: 0, max: 32 },
} as const satisfies Record<string, { min: number; max: number }>;
export type PropiedadAnimable = keyof typeof PROPIEDADES_ANIMABLES;

export type Reducido = 'still' | 'fade' | 'instant';

interface Tiempo {
  duracionMs: number;
  easing: Easing;
  retardoMs: number;
}

/** Movimiento continuo de una Capa; con reduced-motion queda en su fotograma estatico. */
export interface Movimiento extends Tiempo {
  clase: 'movimiento';
  movimiento: NombreDeMovimiento;
  intensidad?: number;
  reducido: 'still';
}

export interface PasoDeKeyframes {
  /** Porcentaje 0..100 de la duracion. */
  en: number;
  valor: number;
}

export interface KeyframesDeCapa extends Tiempo {
  clase: 'keyframes';
  propiedad: PropiedadAnimable;
  pasos: PasoDeKeyframes[];
  reducido: 'still';
}

/** Animacion continua de una Capa: un Movimiento de catalogo o `keyframes` minimos. */
export type Animacion = Movimiento | KeyframesDeCapa;

/** `transition` entre parches de estado. */
export interface Transicion {
  duracionMs: number;
  easing: Easing;
  reducido: 'fade' | 'instant';
}

/** `enter` / `exit` de un elemento. */
export interface Efecto extends Tiempo {
  efecto: NombreDeEfecto;
  reducido: 'fade' | 'instant';
}

/** Parametro tal como llega del DSL: `duration` y `delay` ya en ms, `intensity` como texto o numero. */
export interface ParametroDeAnimacion {
  clave: string;
  valor: string | number;
}

interface Resultado<T> {
  animacion?: T;
  errores: ErrorDeCatalogo[];
}

const UNIDADES: Record<string, number> = { ms: 1, s: 1000 };

/** Duracion de `cantidad` + `unidad` (`ms` o `s`) en milisegundos; `undefined` si la unidad no existe. */
export function duracionEnMs(cantidad: string, unidad: string): number | undefined {
  const factor = UNIDADES[unidad];
  return factor === undefined || Number.isNaN(Number(cantidad)) ? undefined : Math.round(Number(cantidad) * factor);
}

const invalido = (mensaje: string, clave: string): ErrorDeCatalogo => ({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje, clave });

const aNumero = (valor: string | number): number => (typeof valor === 'number' ? valor : /^-?\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : Number.NaN);

interface Especificacion {
  nombre: string;
  duracionMs: number;
  easing: Easing;
  intensidad: boolean;
  reducidos: readonly Reducido[];
  conRetardo: boolean;
}

/** Valida los parametros comunes (duracion, easing, retardo, intensidad, reduced) de una animacion. */
function leerParametros(
  espec: Especificacion,
  params: readonly ParametroDeAnimacion[],
): { tiempo: Tiempo; intensidad: number | undefined; reducido: Reducido; errores: ErrorDeCatalogo[] } {
  const errores: ErrorDeCatalogo[] = [];
  const tiempo: Tiempo = { duracionMs: espec.duracionMs, easing: espec.easing, retardoMs: 0 };
  let intensidad: number | undefined = espec.intensidad ? 0.5 : undefined;
  let reducido: Reducido = espec.reducidos[0] as Reducido;
  const admitidas = ['duration', 'easing', 'reduced', ...(espec.conRetardo ? ['delay'] : []), ...(espec.intensidad ? ['intensity'] : [])];
  for (const { clave, valor } of params) {
    if (!admitidas.includes(clave)) {
      errores.push({
        codigo: CODIGOS.E_THEME_UNKNOWN_PROPERTY,
        mensaje: `'${espec.nombre}' no admite '${clave}'; disponibles: ${admitidas.join(', ')}`,
        clave,
        ...sugerir(clave, admitidas),
      });
    } else if (clave === 'duration' || clave === 'delay') {
      const ms = aNumero(valor);
      const min = clave === 'duration' ? 1 : 0;
      const max = clave === 'duration' ? 60000 : 10000;
      if (Number.isNaN(ms) || ms < min || ms > max) errores.push(invalido(`'${clave}' de '${espec.nombre}' debe estar entre ${min} y ${max} ms, no '${valor}'`, clave));
      else if (clave === 'duration') tiempo.duracionMs = ms;
      else tiempo.retardoMs = ms;
    } else if (clave === 'easing') {
      if ((EASINGS as readonly string[]).includes(String(valor))) tiempo.easing = valor as Easing;
      else errores.push({ ...invalido(`Easing '${valor}' desconocido; disponibles: ${EASINGS.join(', ')}`, clave), ...sugerir(String(valor), EASINGS) });
    } else if (clave === 'intensity') {
      const n = aNumero(valor);
      if (Number.isNaN(n) || n < 0 || n > 1) errores.push(invalido(`'intensity' de '${espec.nombre}' debe ser un numero entre 0 y 1, no '${valor}'`, clave));
      else intensidad = n;
    } else if ((espec.reducidos as readonly string[]).includes(String(valor))) reducido = valor as Reducido;
    else errores.push(invalido(`'reduced' de '${espec.nombre}' solo admite ${espec.reducidos.join(' o ')}, no '${valor}'`, clave));
  }
  return { tiempo, intensidad, reducido, errores };
}

export function construirMovimiento(nombre: string, params: readonly ParametroDeAnimacion[]): Resultado<Movimiento> {
  if (!Object.hasOwn(MOVIMIENTOS, nombre)) {
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_MOTION,
          mensaje: `Movimiento '${nombre}' desconocido; disponibles: ${Object.keys(MOVIMIENTOS).join(', ')}`,
          ...sugerir(nombre, Object.keys(MOVIMIENTOS)),
        },
      ],
    };
  }
  const definicion: { intensidad: boolean; easing: Easing; duracionMs: number } = MOVIMIENTOS[nombre as NombreDeMovimiento];
  const { tiempo, intensidad, errores } = leerParametros(
    { nombre, duracionMs: definicion.duracionMs, easing: definicion.easing, intensidad: definicion.intensidad, reducidos: ['still'], conRetardo: true },
    params,
  );
  if (errores.length > 0) return { errores };
  return {
    animacion: { clase: 'movimiento', movimiento: nombre as NombreDeMovimiento, ...tiempo, ...(intensidad !== undefined && { intensidad }), reducido: 'still' },
    errores,
  };
}

export function construirKeyframes(propiedad: string, params: readonly ParametroDeAnimacion[], pasos: readonly PasoDeKeyframes[]): Resultado<KeyframesDeCapa> {
  if (!Object.hasOwn(PROPIEDADES_ANIMABLES, propiedad)) {
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_MOTION,
          mensaje: `Propiedad animable '${propiedad}' desconocida; solo se anima lo que no toca las Metricas: ${Object.keys(PROPIEDADES_ANIMABLES).join(', ')}`,
          ...sugerir(propiedad, Object.keys(PROPIEDADES_ANIMABLES)),
        },
      ],
    };
  }
  const rango = PROPIEDADES_ANIMABLES[propiedad as PropiedadAnimable];
  const { tiempo, errores } = leerParametros({ nombre: 'keyframes', duracionMs: 1000, easing: 'ease-in-out', intensidad: false, reducidos: ['still'], conRetardo: true }, params);
  if (pasos.length < 2) errores.push(invalido(`'keyframes ${propiedad}' necesita al menos dos pasos`, 'pasos'));
  pasos.forEach((paso, i) => {
    if (paso.en < 0 || paso.en > 100 || (i > 0 && paso.en <= (pasos[i - 1] as PasoDeKeyframes).en)) {
      errores.push(invalido(`El paso ${paso.en} de 'keyframes ${propiedad}' debe estar entre 0 y 100 y crecer respecto del anterior`, 'pasos'));
    }
    if (paso.valor < rango.min || paso.valor > rango.max) {
      errores.push(invalido(`El valor ${paso.valor} de '${propiedad}' debe estar entre ${rango.min} y ${rango.max}`, 'pasos'));
    }
  });
  if (errores.length > 0) return { errores };
  return { animacion: { clase: 'keyframes', propiedad: propiedad as PropiedadAnimable, pasos: pasos.map((p) => ({ ...p })), ...tiempo, reducido: 'still' }, errores };
}

export function construirTransicion(params: readonly ParametroDeAnimacion[]): Resultado<Transicion> {
  const { tiempo, reducido, errores } = leerParametros({ nombre: 'transition', duracionMs: 150, easing: 'ease', intensidad: false, reducidos: ['fade', 'instant'], conRetardo: false }, params);
  if (errores.length > 0) return { errores };
  return { animacion: { duracionMs: tiempo.duracionMs, easing: tiempo.easing, reducido: reducido as 'fade' | 'instant' }, errores };
}

export function construirEfecto(nombre: string, params: readonly ParametroDeAnimacion[]): Resultado<Efecto> {
  if (!(EFECTOS as readonly string[]).includes(nombre)) {
    return {
      errores: [
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_MOTION,
          mensaje: `Efecto '${nombre}' desconocido; disponibles: ${EFECTOS.join(', ')}`,
          ...sugerir(nombre, EFECTOS),
        },
      ],
    };
  }
  const { tiempo, reducido, errores } = leerParametros({ nombre, duracionMs: 300, easing: 'ease-out', intensidad: false, reducidos: ['fade', 'instant'], conRetardo: true }, params);
  if (errores.length > 0) return { errores };
  return { animacion: { efecto: nombre as NombreDeEfecto, ...tiempo, reducido: reducido as 'fade' | 'instant' }, errores };
}

/** `stagger`: retardo entre elementos consecutivos, en ms. */
export function construirEscalonado(ms: number): Resultado<number> {
  return ms >= 0 && ms <= 2000 ? { animacion: ms, errores: [] } : { errores: [invalido(`'stagger' debe estar entre 0 y 2000 ms, no '${ms}'`, 'duration')] };
}
