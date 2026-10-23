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
