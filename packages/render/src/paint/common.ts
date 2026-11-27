/**
 * Shared types and helpers of the Primitive painters (one per Family in
 * this folder). A painter translates the already validated properties of a Layer
 * into CSS declarations; it validates and clamps nothing.
 */
import { primitivesOfFamily } from 'theme';
import type { PaintedLayer } from 'theme';

import { cleanCssValue, num } from '../element';

/** Primitives of the border Family, from the catalog: they count toward the stack's border width. */
const BORDERS: readonly string[] = primitivesOfFamily('borde');

/** CSS declarations of a Layer: property -> value. */
export type Declarations = Record<string, string>;
export type Painter = (props: PaintedLayer['props']) => Declarations;

export const px = (value: number | string | undefined): string => `${num(Number(value))}px`;
export const css = (value: number | string | undefined): string => cleanCssValue(String(value));

/**
 * Properties of several background layers (patterns, gradients, noise): they
 * accumulate comma separated in stack order instead of overriding each other.
 */
export const STACKABLE_BACKGROUNDS = ['background-image', 'background-size'] as const;

/**
 * Offset of a Layer (`offset x y`, `grow`): `translate` moves the Layer's
 * element (composable, animated with `transition`) and `grow` enlarges its width and
 * height without centering. It only paints; the measured box of the Node does not change. `border` is the
 * width of the box border: the element starts at its outer outline, not at the
 * inside of the border, so `offset 0 0` matches the drawn box.
 */
export function offsetDeclarations(props: PaintedLayer['props'], border = 0): Declarations {
  const grows = Number(props['grow'] ?? 0) + 2 * border;
  return {
    ...(border > 0 && { left: px(-border), top: px(-border) }),
    ...((props['offset-x'] !== undefined || props['offset-y'] !== undefined) && { translate: `${px(props['offset-x'] ?? 0)} ${px(props['offset-y'] ?? 0)}` }),
    ...((props['grow'] !== undefined || border > 0) && { width: `calc(100% + ${px(grows)})`, height: `calc(100% + ${px(grows)})` }),
  };
}

/** Border width of a stack: the one of its last Layer of the border Family (0 without border). */
export function borderWidth(layers: readonly PaintedLayer[]): number {
  const border = layers.filter((c) => BORDERS.includes(c.tipo)).pop();
  return border === undefined ? 0 : Number(border.props['width']);
}

/** Whether the Layer paints only a zone of the box (`zone header` or `zone body`); `all` and no `zone` cover the whole box. */
export const isZoneLayer = (layer: PaintedLayer): boolean => layer.props['zone'] === 'header' || layer.props['zone'] === 'body';

/** Whether the Layer moves or grows: it goes in its own element and not in the merged box. */
export const isOffset = (layer: PaintedLayer): boolean => ['offset-x', 'offset-y', 'grow'].some((key) => layer.props[key] !== undefined);
