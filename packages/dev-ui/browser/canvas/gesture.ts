/**
 * Gesture in progress on the canvas (drag, pan or wheel zoom). Measured in Chromium on `examples/rinthel-arch`:
 * with `backdrop-filter` panning raises the frame p95 from ~17 ms to ~33 ms; without it, 17 ms. That is why during the
 * gesture the frame switches to a solid surface (`data-arrastrando`).
 */
import { useEffect, useRef, useState } from 'react';

/** After the last wheel event, the zoom is considered finished. */
const WHEEL_END_MS = 200;

export interface CanvasGesture {
  inGesture: boolean;
  /** Handlers for the canvas container. */
  props: { onPointerDown: () => void; onPointerUp: () => void; onPointerCancel: () => void; onWheel: () => void };
}

export function useCanvasGesture(): CanvasGesture {
  const [pointer, setPointer] = useState(false);
  const [wheel, setWheel] = useState(false);
  const end = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(end.current), []);
  return {
    inGesture: pointer || wheel,
    props: {
      onPointerDown: () => setPointer(true),
      onPointerUp: () => setPointer(false),
      onPointerCancel: () => setPointer(false),
      onWheel: () => {
        setWheel(true);
        clearTimeout(end.current);
        end.current = setTimeout(() => setWheel(false), WHEEL_END_MS);
      },
    },
  };
}
