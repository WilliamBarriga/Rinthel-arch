/**
 * Resize limits of the side islands, without DOM: `useIsland` uses them with the pointer and the keyboard.
 * `height: null` means "whatever the content measures"; a vertical drag starts from `measuredHeight` and fixes px.
 */
export interface IslandSize {
  width: number;
  /** `null`: the height of the content. */
  height: number | null;
}

export interface MeasuredSize extends IslandSize {
  /** Height the island takes on screen now (the content's if `height` is `null`). */
  measuredHeight: number;
}

export type IslandSide = 'izquierda' | 'derecha';
export type HandleAxis = 'horizontal' | 'vertical' | 'diagonal';

export interface Handle {
  side: IslandSide;
  axis: HandleAxis;
}

export interface Canvas {
  width: number;
  height: number;
}

const ISLAND_LIMITS = {
  minWidth: 220,
  maxWidth: 640,
  /** An island does not exceed this fraction of the canvas width. */
  maxFraction: 0.5,
  minHeight: 140,
  /** Gap left under the tallest island (legend, Steps and accessibility strip; see `.ui-isla` in `style.css`). */
  bottomMargin: 64,
  /** Arrow key step on the separator. */
  step: 16,
} as const;

export interface Span {
  min: number;
  max: number;
}

export function islandRange(canvas: Canvas): { width: Span; height: Span } {
  const l = ISLAND_LIMITS;
  return {
    width: { min: l.minWidth, max: Math.max(l.minWidth, Math.min(l.maxWidth, Math.floor(canvas.width * l.maxFraction))) },
    height: { min: l.minHeight, max: Math.max(l.minHeight, canvas.height - l.bottomMargin) },
  };
}

const trim = (value: number, { min, max }: Span): number => Math.min(max, Math.max(min, Math.round(value)));

const movesWidth = (axis: HandleAxis): boolean => axis !== 'vertical';
const movesHeight = (axis: HandleAxis): boolean => axis !== 'horizontal';

/** The right island's handle is on its left edge: moving right narrows it. */
const sign = (side: IslandSide): number => (side === 'izquierda' ? 1 : -1);

export function sizeAfterDrag(start: MeasuredSize, { dx, dy }: { dx: number; dy: number }, { side, axis }: Handle, canvas: Canvas): IslandSize {
  const span = islandRange(canvas);
  return {
    width: movesWidth(axis) ? trim(start.width + sign(side) * dx, span.width) : start.width,
    height: movesHeight(axis) ? trim((start.height ?? start.measuredHeight) + dy, span.height) : start.height,
  };
}

/** Keys of the WAI-ARIA "window splitter" pattern; `undefined` if the key is not one of them. */
export function keyboardSize(key: string, current: MeasuredSize, { side, axis }: Handle, canvas: Canvas): IslandSize | undefined {
  const span = islandRange(canvas);
  const { step } = ISLAND_LIMITS;
  const height = current.height ?? current.measuredHeight;
  const base = { width: current.width, height: current.height };
  if (axis === 'horizontal') {
    if (key === 'ArrowRight' || key === 'ArrowLeft') return { ...base, width: trim(current.width + sign(side) * (key === 'ArrowRight' ? step : -step), span.width) };
    if (key === 'Home') return { ...base, width: span.width.min };
    if (key === 'End') return { ...base, width: span.width.max };
    return undefined;
  }
  if (axis === 'vertical') {
    if (key === 'ArrowDown' || key === 'ArrowUp') return { ...base, height: trim(height + (key === 'ArrowDown' ? step : -step), span.height) };
    if (key === 'Home') return { ...base, height: span.height.min };
    if (key === 'End') return { ...base, height: span.height.max };
  }
  return undefined;
}
