/**
 * `shell`: interactive layer over `render` (ADR 0003, 0008). `<InteractiveView>` adds pan/zoom, Selection, viewport culling, collapse with relayout and morph, drill-down, Steps and semantic zoom; `useHashState` carries that state into the URL hash; `workerAdapter`/`serveLayout` run the layout in a Worker.
 * Invariants: each state (camera, Selection, collapse, View, Step) is controlled by props or internal; it only draws what `render` returns; a layout that arrives late is discarded and the previous one keeps showing.
 * Errors: a missing View, or lacking `view`, `path` and `defaultView`, throws on render; an adapter rejection goes to `onError` or, without it, is thrown on render.
 * Depends on `canonical`, `theme`, `layout`, `session` and `render` (d3-zoom); peer React 18 and 19.
 */
export { InteractiveView } from './interactive-view';
export type { LayoutAdapter, TextMeasurer, InteractiveViewProps } from './interactive-view';
export type { ViewerIssue } from './notices';
/** Pieces of the canvas chrome to mount outside with `chrome={false}` (the `dev` app in `dev-ui`). */
export { Legend } from './accessibility';
export type { LegendMode } from './accessibility';
export { Breadcrumbs } from './navigation';
export type { Navigation } from './navigation';
export { EMPTY_SELECTION, elementBox, elementAt, select } from './interaction';
export type { SelectableElement, SelectionMode, HitTestOptions, Selection, ElementKind } from './interaction';
export type { NavigationProps } from './navigation';
export type { StepsProps } from './steps';
export type { InteractionSettings } from './configuration';
export type { FrameClock } from './morph';
export { DEFAULT_THRESHOLDS, detailLevel } from './semantic-zoom';
export type { DetailThresholds } from './semantic-zoom';
export type { Camera, DetailLevel } from 'render';
export type { IconProvider } from 'canonical';
export { deserializeState, browserHash, serializeState, firstView } from './hash';
export type { HashAdapter, ShellState } from './hash';
export { useHashState } from './hash-state';
export type { HashStateOptions, HashStateProps } from './hash-state';
export type { OnReorderLifelines } from './drag';
export type { PinIntent } from 'canonical';
export type { UndoHistory, Intent } from 'session';
export { workerAdapter } from './worker-layout';
export { serveLayout } from './serve-layout';
export { familyHashes, measureInViewer } from './viewer-measurement';
export type { MeasurementOptions } from './viewer-measurement';
export type { LayoutPort } from './worker-layout';
