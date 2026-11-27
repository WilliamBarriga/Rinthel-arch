/** Row of an ER table (Theme `row` block). Only the height goes into the Metrics; the rest only paints. */
import { ATTRIBUTE_KEYS } from 'canonical';
import type { AttributeKey } from 'canonical';

/** Range of a row height, in px (`height` of the `row` block). */
export const ROW_HEIGHT = { min: 12, max: 120 } as const;

/** Primitive that styles each text of a row; `key` is the chip of each key mark. */
export const ROW_TEXTS = { name: 'text', type: 'text', key: 'chip' } as const;
export type RowTextName = keyof typeof ROW_TEXTS;
export const ROW_TEXT_NAMES = Object.keys(ROW_TEXTS) as RowTextName[];

/** Key marks with their own patch, in the order they apply (the last one wins). */
export const ROW_KEYS: readonly AttributeKey[] = ATTRIBUTE_KEYS;

/** `odd` is 0-based. */
export interface RowVariant {
  odd: boolean;
  keys: readonly AttributeKey[];
  optional: boolean;
}

/** Stable key of a variant: the marks are sorted, so the declaration order of the Attribute does not matter. */
export const rowKey = ({ odd, keys, optional }: RowVariant): string => `${odd ? 'i' : 'p'}|${ROW_KEYS.filter((k) => keys.includes(k)).join('+')}|${optional ? 'o' : '-'}`;

export function rowVariants(): RowVariant[] {
  const subsets = ROW_KEYS.reduce<AttributeKey[][]>((acc, k) => [...acc, ...acc.map((s) => [...s, k])], [[]]);
  return [false, true].flatMap((odd) => subsets.flatMap((keys) => [false, true].map((optional) => ({ odd, keys, optional }))));
}
