/**
 * Tipos y ayudantes comunes de los pintores de Primitivas (uno por Familia en
 * este directorio). Un pintor traduce las propiedades ya validadas de una Capa
 * a declaraciones CSS; no valida ni recorta nada.
 */
import type { CapaPintada } from 'tema';

import { limpiarValorCss, num } from '../elemento';

/** Declaraciones CSS de una Capa: propiedad -> valor. */
export type Declaraciones = Record<string, string>;
export type Pintor = (props: CapaPintada['props']) => Declaraciones;

export const px = (valor: number | string | undefined): string => `${num(Number(valor))}px`;
export const css = (valor: number | string | undefined): string => limpiarValorCss(String(valor));

/**
 * Propiedades de varias capas de fondo (patrones, gradientes, ruido): se
 * acumulan separadas por coma en el orden de la pila en lugar de pisarse.
 */
export const FONDOS_ACUMULABLES = ['background-image', 'background-size'] as const;

/**
 * Desplazamiento de una Capa (`offset x y`, `grow`): `translate` mueve el elemento
 * de la Capa (componible, se anima con `transition`) y `grow` agranda su ancho y
 * alto sin centrar. Solo pinta; la caja medida del Nodo no cambia. `borde` es el
 * grosor del borde de la caja: el elemento sale de su contorno exterior, no del
 * interior del borde, asi `offset 0 0` coincide con la caja dibujada.
 */
export function declaracionesDeDesplazamiento(props: CapaPintada['props'], borde = 0): Declaraciones {
  const crece = Number(props['grow'] ?? 0) + 2 * borde;
  return {
    ...(borde > 0 && { left: px(-borde), top: px(-borde) }),
    ...((props['offset-x'] !== undefined || props['offset-y'] !== undefined) && { translate: `${px(props['offset-x'] ?? 0)} ${px(props['offset-y'] ?? 0)}` }),
    ...((props['grow'] !== undefined || borde > 0) && { width: `calc(100% + ${px(crece)})`, height: `calc(100% + ${px(crece)})` }),
  };
}

/** Grosor del borde de una pila: el de su ultima Capa de la Familia borde (0 sin borde). */
export function anchoDeBorde(capas: readonly CapaPintada[]): number {
  const borde = capas.filter((c) => c.tipo === 'border' || c.tipo === 'dashed' || c.tipo === 'dotted').pop();
  return borde === undefined ? 0 : Number(borde.props['width']);
}

/** Si la Capa se mueve o crece: va en un elemento propio y no en la caja fusionada. */
export const estaDesplazada = (capa: CapaPintada): boolean => ['offset-x', 'offset-y', 'grow'].some((clave) => capa.props[clave] !== undefined);
