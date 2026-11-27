/** Morph between two geometries: pure interpolation and the hook that animates it; without a clock, or with duration 0, there is no animation. */
import { useCallback, useEffect, useState } from 'react';

import type { NodeBox, Geometry, GraphGeometry, SequenceGeometry, EdgeRoute, Visibility } from 'canonical';

/** Requests a frame (`frame` receives the time in ms) and returns the function that cancels it. */
export type FrameClock = (frame: (nowMs: number) => void) => () => void;

/** `requestAnimationFrame` clock, or `undefined` if the environment lacks it. */
export function browserClock(): FrameClock | undefined {
  return typeof requestAnimationFrame === 'function' ? rafClock : undefined;
}

/** A single function for all renders: `useMorph` uses it as an effect dependency and, if its identity changed, it would restart the morph on every frame. */
const rafClock: FrameClock = (frame) => {
  const id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
};

export interface Morph {
  from: Geometry;
  to: Geometry;
  /** Touched Group, which stays fixed on screen. */
  anchor: string;
}

const smoothed = (t: number): number => t * t * (3 - 2 * t);

/** Returns the morph in progress with its progress `t` in 0..1 (already smoothed), `start` and `cancel`. */
export function useMorph(
  durationMs: number,
  clock: FrameClock | undefined = browserClock(),
): {
  morph: (Morph & { t: number }) | undefined;
  start: (morph: Morph) => void;
  cancel: () => void;
} {
  const [active, setActive] = useState<Morph>();
  const [t, setT] = useState(0);
  const start = useCallback(
    (morph: Morph) => {
      if (durationMs <= 0 || clock === undefined) return;
      setT(0);
      setActive(morph);
    },
    [durationMs, clock],
  );
  const cancel = useCallback(() => setActive(undefined), []);

  useEffect(() => {
    if (active === undefined || clock === undefined) return;
    let startedAt: number | undefined;
    let cancelFrame = (): void => {};
    const step = (now: number): void => {
      startedAt ??= now;
      const lineal = Math.min(1, (now - startedAt) / durationMs);
      if (lineal >= 1) {
        setActive(undefined);
        return;
      }
      setT(smoothed(lineal));
      cancelFrame = clock(step);
    };
    cancelFrame = clock(step);
    return () => cancelFrame();
  }, [active, durationMs, clock]);

  return { morph: active === undefined ? undefined : { ...active, t }, start, cancel };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mixBox(a: NodeBox, b: NodeBox, t: number): NodeBox {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), width: mix(a.width, b.width, t), height: mix(a.height, b.height, t) };
}

function mixPath(a: EdgeRoute, b: EdgeRoute, t: number): EdgeRoute {
  if (a.points.length !== b.points.length) return b;
  return { points: b.points.map((p, i) => ({ x: mix(a.points[i]!.x, p.x, t), y: mix(a.points[i]!.y, p.y, t) })) };
}

/**
 * Intermediate geometry between `from` (t = 0) and `to` (t = 1). What exists
 * in both is interpolated; what only exists in `to` stays at its final place
 * (`morphVisibility` fades it in); routes with a different number of points jump
 * to the new one.
 */
export function interpolateGeometry(from: Geometry, to: Geometry, t: number): Geometry {
  switch (to.kind) {
    case 'grafo':
      return from.kind === 'grafo' ? interpolateGraph(from, to, t) : to;
    case 'secuencia':
      return from.kind === 'secuencia' ? interpolateSequence(from, to, t) : to;
  }
}

/**
 * Sequence: headers, Lifeline lines, activations (if their number does not change), Message
 * arrows and Group `box`es are interpolated; the rest (frames, Notes, labels) jumps to the final position.
 */
function interpolateSequence(from: SequenceGeometry, to: SequenceGeometry, t: number): SequenceGeometry {
  const nodes: SequenceGeometry['nodes'] = {};
  for (const [id, box] of Object.entries(to.nodes)) {
    const previousRoute = from.nodes[id];
    nodes[id] = previousRoute === undefined ? box : mixBox(previousRoute, box, t);
  }
  const lifelines: SequenceGeometry['lifelines'] = {};
  for (const [id, line] of Object.entries(to.lifelines)) {
    const previousRoute = from.lifelines[id];
    lifelines[id] = previousRoute === undefined ? line : { ...line, x: mix(previousRoute.x, line.x, t), y1: mix(previousRoute.y1, line.y1, t), y2: mix(previousRoute.y2, line.y2, t) };
  }
  const activations = to.activations.map((activation, i) => {
    const previousRoute = from.activations[i];
    if (from.activations.length !== to.activations.length || previousRoute === undefined || previousRoute.lifeline !== activation.lifeline) return activation;
    return { ...activation, x: mix(previousRoute.x, activation.x, t), y1: mix(previousRoute.y1, activation.y1, t), y2: mix(previousRoute.y2, activation.y2, t) };
  });
  const messages: SequenceGeometry['messages'] = {};
  for (const [path, message] of Object.entries(to.messages)) {
    const previous = from.messages[path];
    const sameOnes = previous !== undefined && previous.points.length === message.points.length;
    messages[path] = sameOnes
      ? {
          ...message,
          points: message.points.map((p, i) => ({ x: mix(previous.points[i]!.x, p.x, t), y: mix(previous.points[i]!.y, p.y, t) })),
          ...(message.label !== undefined && previous.label !== undefined && { label: mixBox(previous.label, message.label, t) }),
        }
      : message;
  }
  const groups = to.groups.map((group) => {
    const previous = from.groups.find((g) => g.id === group.id);
    return previous === undefined ? group : { ...group, x: mix(previous.x, group.x, t), y: mix(previous.y, group.y, t), width: mix(previous.width, group.width, t), height: mix(previous.height, group.height, t) };
  });
  return { ...to, nodes, lifelines, activations, messages, groups, width: mix(from.width, to.width, t), height: mix(from.height, to.height, t) };
}

function interpolateGraph(from: GraphGeometry, to: GraphGeometry, t: number): GraphGeometry {
  const nodes: Record<string, NodeBox> = {};
  for (const [id, box] of Object.entries(to.nodes)) {
    const previousRoute = from.nodes[id];
    nodes[id] = previousRoute === undefined ? box : mixBox(previousRoute, box, t);
  }
  const edges: Record<string, EdgeRoute> = {};
  for (const [id, path] of Object.entries(to.edges)) {
    const previousRoute = from.edges[id];
    edges[id] = previousRoute === undefined ? path : mixPath(previousRoute, path, t);
  }
  return { ...to, nodes, edges, width: mix(from.width, to.width, t), height: mix(from.height, to.height, t) };
}

/** Visibility during the morph: what was not in `from` enters with fade `t`; the rest follows `base` (or 1). */
export function morphVisibility(from: Geometry, to: Geometry, t: number, base?: Visibility): Visibility {
  return (id) => {
    const previousRoute = base?.(id) ?? 1;
    const newEdge = to.kind === 'grafo' && from.kind === 'grafo' && to.edges[id] !== undefined && from.edges[id] === undefined;
    const isNew = (to.nodes[id] !== undefined && from.nodes[id] === undefined) || newEdge;
    return isNew ? previousRoute * t : previousRoute;
  };
}
