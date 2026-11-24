/**
 * Workspace file conventions (ADR 0005). The old Spanish names are an `error` Issue whose `fix` renames the file
 * or folder; there are no aliases. The table is data: a later rename adds a row.
 */
import type { Issue } from './issue';
import type { Renombre } from './nombres-antiguos';

/** Old name: a file basename (`tema.dg`) or a folder name (`temas`), at any depth. Same row shape as the catalog table (`nombres-antiguos.ts`). */
export type ConvencionRenombrada = Renombre<'file' | 'folder'>;

export const CONVENCIONES_RENOMBRADAS: readonly ConvencionRenombrada[] = Object.freeze([
  { old: 'tema.dg', new: 'theme.dg', kind: 'file' },
  { old: 'temas', new: 'themes', kind: 'folder' },
  { old: 'fuentes', new: 'fonts', kind: 'folder' },
]);

/**
 * One `old-workspace-convention` error per file or folder that uses an old name. `rutas` are Workspace-relative
 * with `/`. A path with several old names reports only the outermost (renaming it exposes the next one on the
 * following `validate`), so each `fix` path is valid when it is applied. The `fix` is a rename: `rename` is the
 * new path of `file`, and `range` and `replacement` are an empty edit at 1:1 so a text-only consumer does nothing.
 */
export function convencionesObsoletas(rutas: readonly string[]): Issue[] {
  const vistas = new Set<string>();
  const issues: Issue[] = [];
  for (const ruta of rutas) {
    const segmentos = ruta.split('/');
    const indice = segmentos.findIndex((nombre, i) =>
      CONVENCIONES_RENOMBRADAS.some((c) => c.old === nombre && (c.kind === 'folder' ? i < segmentos.length - 1 : i === segmentos.length - 1)),
    );
    if (indice < 0) continue;
    const convencion = CONVENCIONES_RENOMBRADAS.find((c) => c.old === segmentos[indice])!;
    const antigua = segmentos.slice(0, indice + 1).join('/');
    if (vistas.has(antigua)) continue;
    vistas.add(antigua);
    const nueva = [...segmentos.slice(0, indice), convencion.new].join('/');
    issues.push({
      code: 'old-workspace-convention',
      severity: 'error',
      file: antigua,
      line: 1,
      column: 1,
      message: `The ${convencion.kind} name '${convencion.old}' is no longer used; the convention is '${convencion.new}'`,
      hint: `rename '${antigua}' to '${nueva}'`,
      fix: { file: antigua, range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '', rename: nueva },
    });
  }
  return issues;
}
