/**
 * `render`: `<Diagram>` draws a resolved View and its Geometry as a React tree; `resolveStyle` derives the Style
 * from the Theme (ADR 0002, 0008).
 * Invariants: no state nor effects; byte-for-byte deterministic markup; colors only from the Theme Palette; what is
 * animated never triggers a relayout; Workspace code comes in only through the `components` prop.
 * Errors: throws if a Node of the View is not in the Geometry, if the Geometry is of another Diagram type or if the
 * Theme does not satisfy `resolveTheme`. Depends on `canonical`, `theme` and `layout`; peer React 18 and 19.
 */
export { Diagram } from './diagram';
export type { ThemeComponent, ThemeComponents, CodeProps } from './code';
export type { DiagramProps } from './diagram';
export type { Camera, States, DetailLevel } from './scene';
export { resolveStyle } from './style';
export { fontSheet } from './sheet';
export { PAINTERS } from './sheet';
export { boxlessLabelCenter } from './painters';
export type { StateLook, VisualState, Style } from './style';
