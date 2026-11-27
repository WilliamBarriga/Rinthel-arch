/**
 * `layout` — `layoutView` computes the `Geometry` of a View (ELK for graphs, an own algorithm for sequence),
 * with boxes relative to the parent Group; `layoutKey`/`structureKey` say when to relayout and
 * `applyPinsToGeometry` applies the Pins without ELK; `geometryIndex` gives absolute boxes, parents and roots (ADR 0003).
 * Invariants: deterministic; no DOM; runs in Node and in a Web Worker; `render` must receive the same Metrics.
 * Error modes: ELK failures reject the promise. Dependencies: `canonical` and `theme`; `options.elk` injects the engine.
 */
export { applyPinsToGeometry, structureKey, layoutKey, layoutWithMetrics, layoutView } from './layout';
export { geometryIndex } from './geometry-index';
export type { GeometryIndex } from './geometry-index';
export type { LayoutOptions } from './layout';
