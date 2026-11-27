/**
 * Text measuring: `estimado` computes the width per character; `medido` receives it as data from the viewer.
 * The level and the font hashes go into the structure key; the widths do not (they depend on texts and fonts).
 */

import { fnv1aOfUnits } from './seed';

export interface MetricsMeasurement {
  nivel: 'estimado' | 'medido';
  /** Hash of the file of each family the Theme declares; empty when estimating. */
  fuentes: Record<string, string>;
}

/** Serializable: travels to the layout Worker. */
export interface TextMeasures {
  nivel: 'medido';
  fuentes: Record<string, string>;
  /** Width in px by `textKey(family, size, text)`. */
  anchos: Record<string, number>;
}

export interface TextToMeasure {
  familia: string;
  tamano: number;
  texto: string;
  /** `weight` of the style; without it, normal. */
  peso?: number;
}

export const textKey = (family: string, size: number, text: string, weight?: number): string =>
  weight === undefined ? `${family}|${size}|${text}` : `${family}|${weight}|${size}|${text}`;

/** The measure if it exists; otherwise the per-character estimate (`factor` = average width relative to the size). */
export function textWidth(
  origin: { anchos?: Readonly<Record<string, number>> | undefined; factorDeAncho: number },
  family: string,
  size: number,
  text: string,
  weight?: number,
): number {
  return origin.anchos?.[textKey(family, size, text, weight)] ?? text.length * size * origin.factorDeAncho;
}

/** 32-bit FNV-1a in hex, stable across engines. */
export function fontHash(bytes: Uint8Array): string {
  return fnv1aOfUnits(bytes.length, (i) => bytes[i] ?? 0)
    .toString(16)
    .padStart(8, '0');
}
