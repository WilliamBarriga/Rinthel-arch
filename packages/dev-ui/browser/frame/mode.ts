/**
 * Mode of the Dev UI: `dev` (served by `diagrams dev`, can write) or `export` (a read-only HTML file written by
 * `diagrams export`). It is the single flag of the read-only mode: `<DevUi mode>` sets it, `useDevUi().mode` reads
 * it. Components ask the capability (`useDevUi().canWrite`, from `canWriteIn`) instead of comparing the
 * mode, and the registries (tabs, top bar pills, commands, tour stops) mark with `devOnly` what only makes sense in
 * `dev` (editing, Undo history, agent activity, Diffs and `inspect`-based panels) and with `exportOnly` what only
 * makes sense in the export.
 */
export type DevUiMode = 'dev' | 'export';

/** Whether `mode` can write the Workspace and open its code (Gestures, Pin, Code, Details): only `dev`. */
export const canWriteIn = (mode: DevUiMode): boolean => mode === 'dev';

/** An entry of a registry that only exists in one mode. */
export interface WithMode {
  devOnly?: boolean;
  exportOnly?: boolean;
}

/** The entries of a registry available in `mode`. */
export const availableIn = <T extends WithMode>(entries: readonly T[], mode: DevUiMode): readonly T[] =>
  entries.filter((e) => (canWriteIn(mode) ? e.exportOnly !== true : e.devOnly !== true));
