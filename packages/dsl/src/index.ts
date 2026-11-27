/**
 * `dsl` — compiles the text DSL to the Canonical form and merges the Workspace (ADR 0001).
 *
 * Invariants: one-way compilation (DSL -> canonical); deterministic multi-file merge.
 * Error modes: never throws; `compile` returns every issue with position and stable code.
 * Dependencies: `canonical` and `theme` (Themes are validated against its catalog). Does not read disk.
 */
export { compile } from './compile';
export type { WorkspaceFiles, PinPosition, CompileResult } from './compile';
export type { ThemeOrigin } from './themes';
