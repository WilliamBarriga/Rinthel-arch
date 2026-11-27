/** Scene element (HTML or SVG) and CSS formatting helpers. */

import { fnv1a } from 'theme';

import type { ThemeComponent, CodeProps } from './code';

/** HTML or SVG element: attributes and, as content, children, text or inline markup (icons, style sheet). */
export interface MarkupElement {
  tag: string;
  attrs: Record<string, string>;
  children?: (MarkupElement | string)[];
  /** Already sanitized markup that goes inside the element (the icon, the style sheet). */
  html?: string;
  onClick?: () => void;
  /** Theme component (`code` Layer) mounted inside the element, with its read-only props. */
  component?: { kind: ThemeComponent; props: CodeProps };
}

/** Stable number: at most two decimals, no trailing zeros. */
export function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Removes the characters that would close the declaration, the rule or the `<style>`: the Theme is foreign input. */
export function cleanCssValue(value: string): string {
  return value.replace(/[<>{};\\\n\r]/g, '');
}

/** CSS declarations of an inline `style`, separated by `;` (not cleaned: the caller already controls the values). */
export const inlineStyle = (declarations: Readonly<Record<string, string>>): string =>
  Object.entries(declarations)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');

/** CSS declarations with every value cleaned (`cleanCssValue`) and a `;` after each one, to chain more style afterwards. */
export const cleanDeclarations = (declarations: Readonly<Record<string, string>>): string =>
  Object.entries(declarations)
    .map(([property, value]) => `${property}:${cleanCssValue(value)};`)
    .join('');

/** 32-bit FNV-1a in base 36: short, stable identifier of the content. */
export function fingerprint(text: string): string {
  return fnv1a(text).toString(36);
}
