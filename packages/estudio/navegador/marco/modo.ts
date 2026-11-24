/**
 * Mode of the Dev UI: `dev` (served by `diagrams dev`, can write) or `export` (a read-only HTML file written by
 * `diagrams export`). It is the single flag of the read-only mode: `<Estudio modo>` sets it, `useEstudio().modo` reads
 * it, and the registries (tabs, top bar pills, commands) mark with `soloEnDev` what only makes sense in `dev`
 * (editing, Undo history, agent activity, Diffs and `inspect`-based panels).
 */
export type ModoDelEstudio = 'dev' | 'export';

/** An entry of a registry that only exists in `dev`. */
export interface ConModo {
  soloEnDev?: boolean;
}

/** The entries of a registry available in `modo`. */
export const disponiblesEn = <T extends ConModo>(entradas: readonly T[], modo: ModoDelEstudio): readonly T[] => (modo === 'dev' ? entradas : entradas.filter((e) => e.soloEnDev !== true));
