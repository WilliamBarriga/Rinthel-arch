/**
 * Fila de una tabla ER (ADR 0009, bloque `row` del Tema): constantes y reglas compartidas. El Tema da una pila de
 * Capas por fila, un alto, el parche de las filas impares, el estilo de sus textos y los parches por marca de clave y
 * por Atributo opcional. Solo el alto entra en las Metricas (`tablaDeMetricas`); el resto solo pinta.
 */
import { CLAVES_DE_ATRIBUTO } from 'canonico';
import type { ClaveDeAtributo } from 'canonico';

/** Rango del alto de una fila, en px (`height` del bloque `row`). */
export const ALTO_DE_FILA = { min: 12, max: 120 } as const;

/** Textos de una fila que el Tema estiliza y la Primitiva con la que se estilizan: `key` es el chip de cada marca de clave. */
export const TEXTOS_DE_FILA = { name: 'text', type: 'text', key: 'chip' } as const;
export type TextoDeFila = keyof typeof TEXTOS_DE_FILA;
export const NOMBRES_DE_TEXTO_DE_FILA = Object.keys(TEXTOS_DE_FILA) as TextoDeFila[];

/** Marcas de clave con parche propio, en el orden en que se aplican (la ultima gana). */
export const CLAVES_DE_FILA: readonly ClaveDeAtributo[] = CLAVES_DE_ATRIBUTO;

/** Lo que distingue la pila de una fila: si es impar (0-based), sus marcas de clave y si es opcional. */
export interface VarianteDeFila {
  impar: boolean;
  keys: readonly ClaveDeAtributo[];
  opcional: boolean;
}

/** Clave estable de una variante: las marcas se ordenan, asi que el orden de declaracion del Atributo no importa. */
export const claveDeFila = ({ impar, keys, opcional }: VarianteDeFila): string => `${impar ? 'i' : 'p'}|${CLAVES_DE_FILA.filter((k) => keys.includes(k)).join('+')}|${opcional ? 'o' : '-'}`;

/** Todas las variantes posibles, para precalcular la pintura de la fila. */
export function variantesDeFila(): VarianteDeFila[] {
  const subconjuntos = CLAVES_DE_FILA.reduce<ClaveDeAtributo[][]>((acc, k) => [...acc, ...acc.map((s) => [...s, k])], [[]]);
  return [false, true].flatMap((impar) => subconjuntos.flatMap((keys) => [false, true].map((opcional) => ({ impar, keys, opcional }))));
}
