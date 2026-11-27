/**
 * `useIsland`: size, visibility and handles of a side island. Width and height change with Pointer Events
 * (`setPointerCapture`) or with the separator keyboard (WAI-ARIA "window splitter" pattern); the limits are the pure
 * functions of `limits.ts`. `height: null` lets the island measure its content; a double click on a height handle
 * goes back to that. While dragging, `dragging` is `true` (the frame lowers the glass during the gesture).
 */
import { useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, PointerEvent } from 'react';

import { islandRange, keyboardSize, sizeAfterDrag } from './limits';
import type { HandleAxis, IslandSide, Canvas, IslandSize, MeasuredSize } from './limits';

export interface IslandOptions {
  side: IslandSide;
  /** `id` of the island element, for `aria-controls`. */
  id: string;
  /** Name of the island in the handle labels ("left panel"). */
  name: string;
  canvas: Canvas;
  initialWidth: number;
}

export interface Island {
  size: IslandSize;
  hidden: boolean;
  dragging: boolean;
  toggle(): void;
  show(): void;
  hide(): void;
  /** Widens the island up to `minimum` (clamped to the canvas maximum); if it is already wider, nothing changes. */
  widen(minimum: number): void;
  /** To measure the content height when a gesture starts. */
  ref: (element: HTMLElement | null) => void;
  /** Props of the handle of an axis: accessible separator for `horizontal` and `vertical`; the corner is pointer only. */
  handle(axis: HandleAxis): HTMLAttributes<HTMLDivElement>;
}

export function useIsland({ side, id, name, canvas, initialWidth }: IslandOptions): Island {
  const [size, setSize] = useState<IslandSize>({ width: initialWidth, height: null });
  const [hidden, setHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const element = useRef<HTMLElement | null>(null);
  const gesture = useRef<{ x: number; y: number; start: MeasuredSize; axis: HandleAxis } | undefined>(undefined);

  const measured = (): MeasuredSize => ({ ...size, measuredHeight: Math.round(element.current?.getBoundingClientRect().height ?? 0) });
  const span = islandRange(canvas);

  const handle = (axis: HandleAxis): HTMLAttributes<HTMLDivElement> => {
    const pointer: HTMLAttributes<HTMLDivElement> = {
      onPointerDown(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        gesture.current = { x: e.clientX, y: e.clientY, start: measured(), axis };
        setDragging(true);
      },
      onPointerMove(e: PointerEvent<HTMLDivElement>) {
        const g = gesture.current;
        if (g === undefined) return;
        setSize(sizeAfterDrag(g.start, { dx: e.clientX - g.x, dy: e.clientY - g.y }, { side, axis: g.axis }, canvas));
      },
      onPointerUp(e: PointerEvent<HTMLDivElement>) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        gesture.current = undefined;
        setDragging(false);
      },
      onPointerCancel() {
        gesture.current = undefined;
        setDragging(false);
      },
    };
    const backToContent = (): void => setSize((t) => ({ ...t, height: null }));
    if (axis === 'diagonal') return { ...pointer, 'aria-hidden': true, onDoubleClick: backToContent };
    const keyboard = (e: KeyboardEvent<HTMLDivElement>): void => {
      const fresh = keyboardSize(e.key, measured(), { side, axis }, canvas);
      if (fresh === undefined) return;
      e.preventDefault();
      setSize(fresh);
    };
    if (axis === 'horizontal') {
      return { ...pointer, role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-label': `Width of the ${name}`, 'aria-controls': id, 'aria-valuemin': span.width.min, 'aria-valuemax': span.width.max, 'aria-valuenow': size.width, onKeyDown: keyboard };
    }
    return {
      ...pointer,
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'horizontal',
      'aria-label': `Height of the ${name}`,
      'aria-controls': id,
      'aria-valuemin': span.height.min,
      'aria-valuemax': span.height.max,
      'aria-valuenow': size.height ?? Math.round(element.current?.getBoundingClientRect().height ?? span.height.min),
      'aria-valuetext': size.height === null ? 'content height' : `${size.height} px`,
      onKeyDown: keyboard,
      onDoubleClick: backToContent,
    };
  };

  return {
    size: size,
    hidden: hidden,
    dragging: dragging,
    toggle: () => setHidden((o) => !o),
    show: () => setHidden(false),
    hide: () => setHidden(true),
    widen: (minimum) => setSize((t) => (t.width >= minimum ? t : { ...t, width: Math.max(t.width, Math.min(minimum, span.width.max)) })),
    ref: (domNode) => {
      element.current = domNode;
    },
    handle: handle,
  };
}
