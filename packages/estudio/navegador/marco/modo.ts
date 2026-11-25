/**
 * Mode of the Dev UI: `dev` (served by `diagrams dev`, can write) or `export` (a read-only HTML file written by
 * `diagrams export`). It is the single flag of the read-only mode: `<Estudio modo>` sets it, `useEstudio().modo` reads
 * it. Components ask the capability (`useEstudio().puedeEscribir`, from `puedeEscribirEn`) instead of comparing the
 * mode, and the registries (tabs, top bar pills, commands, tour stops) mark with `soloEnDev` what only makes sense in
 * `dev` (editing, Undo history, agent activity, Diffs and `inspect`-based panels) and with `soloEnExport` what only
 * makes sense in the export.
 */
export type ModoDelEstudio = 'dev' | 'export';

/** Whether `modo` can write the Workspace and open its code (Gestures, Pin, Code, Details): only `dev`. */
export const puedeEscribirEn = (modo: ModoDelEstudio): boolean => modo === 'dev';

/** An entry of a registry that only exists in one mode. */
export interface ConModo {
  soloEnDev?: boolean;
  soloEnExport?: boolean;
}

/** The entries of a registry available in `modo`. */
export const disponiblesEn = <T extends ConModo>(entradas: readonly T[], modo: ModoDelEstudio): readonly T[] =>
  entradas.filter((e) => (puedeEscribirEn(modo) ? e.soloEnExport !== true : e.soloEnDev !== true));
