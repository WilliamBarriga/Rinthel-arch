/**
 * Node drag under `dev`: mouse gesture (threshold, position in geometry units) and the provisional
 * position of the Node until another geometry arrives or the move callback rejects it.
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { SequenceGeometry } from 'canonical';
import type { Camera } from 'render';

import type { Computation } from './geometry';
import { orderAfterDrag, unitAt } from './order-lifelines';

export type Motion = { id: string; x: number; y: number };
export type OnReorderLifelines = (change: { order: string[] }) => void | boolean | Promise<boolean | void>;
export type OnMoveNode = (motion: Motion) => void | boolean | Promise<boolean | void>;

/** Id of the drawn Node (the innermost `[data-id]` box) under an event, if any. */
export function nodeIdAt(target: EventTarget | null): string | undefined {
  return (target as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? undefined;
}

export interface DragInput {
  zone: RefObject<HTMLElement | null>;
  /** Enabled only if there is a move callback. */
  onNodeMove: OnMoveNode | undefined;
  /** Enabled only if there is a reorder callback; it applies in sequence Views, where there are no Pins. */
  onReorder?: OnReorderLifelines | undefined;
  /** Current computation (without morph or offset): when it changes, the provisional offset is discarded. */
  computation: Computation | undefined;
  currentCamera: RefObject<Camera>;
  width: number;
  /** Distance in screen pixels from which the gesture counts as a drag. */
  threshold: number;
}

/** Returns the provisional position of the dragged Node, `inProgress` (id of the Node while the gesture is alive, to draw it as a ghost) and whether a drag just ended (to ignore the click that follows). */
export function useDrag(e: DragInput): { shifted: Motion | undefined; dragging: RefObject<boolean>; inProgress: string | undefined } {
  const [shifted, setShifted] = useState<Motion | undefined>(undefined);
  const [inProgress, setInProgress] = useState<string | undefined>(undefined);
  const dragging = useRef(false);
  // The gesture effect is long-lived: it always reads the latest through refs.
  const lastOne = useRef(e);
  lastOne.current = e;

  useEffect(() => {
    setShifted(undefined);
  }, [e.computation]);

  // In sequence there are no Pins: headers and the title of a `box` are dragged to reorder Lifelines.
  const inSequence = e.computation?.geometry.kind === 'secuencia';
  const draggable = inSequence ? e.onReorder !== undefined : e.onNodeMove !== undefined;
  useEffect(() => {
    if (!draggable) return;
    const node = e.zone.current!;
    const handlePress = (event: MouseEvent): void => {
      if (event.button !== 0 || event.ctrlKey) return;
      const geometry = lastOne.current.computation?.geometry;
      if (geometry?.kind === 'secuencia') return pressInSequence(event, geometry);
      const id = nodeIdAt(event.target);
      const box = id === undefined ? undefined : geometry?.nodes[id];
      if (id === undefined || box === undefined) return;
      const [x0, y0] = [event.clientX, event.clientY];
      let movedOne = false;
      /** Screen pixels per diagram unit with the camera of this instant. */
      const currentScale = (): number => e.width / e.currentCamera.current!.width;
      const handleMove = (m: MouseEvent): void => {
        const [px, py] = [m.clientX - x0, m.clientY - y0];
        if (!movedOne && Math.hypot(px, py) < lastOne.current.threshold) return;
        movedOne = true;
        setInProgress(id);
        m.preventDefault();
        const k = currentScale();
        setShifted({ id, x: Math.round(box.x + px / k), y: Math.round(box.y + py / k) });
      };
      const handleRelease = (m: MouseEvent): void => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleRelease);
        setInProgress(undefined);
        if (!movedOne) return;
        const k = currentScale();
        const [x, y] = [Math.round(box.x + (m.clientX - x0) / k), Math.round(box.y + (m.clientY - y0) / k)];
        const target = { id, x, y };
        // The click that follows the release must not select nor navigate.
        dragging.current = true;
        setTimeout(() => {
          dragging.current = false;
        }, 0);
        setShifted(target);
        const giveBack = (): void => setShifted((d) => (d?.id === id ? undefined : d));
        try {
          // The Pin anchors the center: the callback carries the center of the dropped box.
          const result = lastOne.current.onNodeMove?.({ id, x: Math.round(x + box.width / 2), y: Math.round(y + box.height / 2) });
          if (typeof result === 'object') result.then((ok) => ok === false && giveBack(), giveBack);
          else if (result === false) giveBack();
        } catch {
          giveBack();
        }
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleRelease);
    };
    /** Reorder Lifelines: the header (or the title of a `box`) follows the mouse horizontally and on release reports the visible order. */
    const pressInSequence = (event: MouseEvent, geometry: SequenceGeometry): void => {
      const k0 = e.width / e.currentCamera.current!.width;
      const box = node.getBoundingClientRect();
      const camera = e.currentCamera.current!;
      const activeView = lastOne.current.computation!.view;
      const groups = activeView.type === 'sequence' ? (activeView.interaction.groups ?? []) : [];
      const unitValue = unitAt(geometry, groups, { x: camera.x + (event.clientX - box.left) / k0, y: camera.y + (event.clientY - box.top) / k0 });
      if (unitValue === undefined) return;
      const order = lastOne.current.computation!.view.nodes.map((n) => n.id);
      const [x0, y0] = [event.clientX, event.clientY];
      let movedOne = false;
      const offset = (m: MouseEvent): number => (m.clientX - x0) / (e.width / e.currentCamera.current!.width);
      const handleMove = (m: MouseEvent): void => {
        if (!movedOne && Math.hypot(m.clientX - x0, m.clientY - y0) < lastOne.current.threshold) return;
        movedOne = true;
        setInProgress(unitValue.id);
        m.preventDefault();
        const header = geometry.nodes[unitValue.id];
        if (!unitValue.block && header !== undefined) setShifted({ id: unitValue.id, x: Math.round(header.x + offset(m)), y: header.y });
      };
      const handleRelease = (m: MouseEvent): void => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleRelease);
        setInProgress(undefined);
        if (!movedOne) return;
        dragging.current = true;
        setTimeout(() => {
          dragging.current = false;
        }, 0);
        const newOrder = orderAfterDrag(geometry, groups, order, unitValue, offset(m));
        const giveBack = (): void => setShifted((d) => (d?.id === unitValue.id ? undefined : d));
        if (newOrder.every((id, i) => id === order[i])) return giveBack();
        try {
          const result = lastOne.current.onReorder?.({ order: newOrder });
          if (typeof result === 'object') result.then((ok) => ok === false && giveBack(), giveBack);
          else if (result === false) giveBack();
        } catch {
          giveBack();
        }
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleRelease);
    };
    node.addEventListener('mousedown', handlePress);
    return () => node.removeEventListener('mousedown', handlePress);
  }, [draggable, inSequence]);

  return { shifted, dragging, inProgress };
}
