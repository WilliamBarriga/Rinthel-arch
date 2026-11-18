/** Fila de una tabla ER (bloque `row` del Tema). Solo el alto entra en las Metricas; el resto solo pinta. */
import { CLAVES_DE_ATRIBUTO } from 'canonico';
import type { ClaveDeAtributo } from 'canonico';

/** Rango del alto de una fila, en px (`height` del bloque `row`). */
export const ALTO_DE_FILA = { min: 12, max: 120 } as const;

/** Primitiva con la que se estiliza cada texto de una fila; `key` es el chip de cada marca de clave. */
export const TEXTOS_DE_FILA = { name: 'text', type: 'text', key: 'chip' } as const;
export type TextoDeFila = keyof typeof TEXTOS_DE_FILA;
export const NOMBRES_DE_TEXTO_DE_FILA = Object.keys(TEXTOS_DE_FILA) as TextoDeFila[];

/** Marcas de clave con parche propio, en el orden en que se aplican (la ultima gana). */
export const CLAVES_DE_FILA: readonly ClaveDeAtributo[] = CLAVES_DE_ATRIBUTO;

/** `impar` es 0-based. */
export interface VarianteDeFila {
  impar: boolean;
  keys: readonly ClaveDeAtributo[];
  opcional: boolean;
}

/** Clave estable de una variante: las marcas se ordenan, asi que el orden de declaracion del Atributo no importa. */
export const claveDeFila = ({ impar, keys, opcional }: VarianteDeFila): string => `${impar ? 'i' : 'p'}|${CLAVES_DE_FILA.filter((k) => keys.includes(k)).join('+')}|${opcional ? 'o' : '-'}`;

export function variantesDeFila(): VarianteDeFila[] {
  const subconjuntos = CLAVES_DE_FILA.reduce<ClaveDeAtributo[][]>((acc, k) => [...acc, ...acc.map((s) => [...s, k])], [[]]);
  return [false, true].flatMap((impar) => subconjuntos.flatMap((keys) => [false, true].map((opcional) => ({ impar, keys, opcional }))));
}
