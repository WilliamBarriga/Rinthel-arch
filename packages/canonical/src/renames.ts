/**
 * Renames of the public contract: old (Spanish) name -> new (English) name. An old name is never an alias: it is an
 * `error` Issue whose `fix` rewrites it. These tables are the only place that knows the pairs; adding a rename is one
 * row. Two families share the `Rename` row:
 * - catalog values (#229 and the review of #226): a word written in a Theme or a View (`motion`, `effect`, `state`,
 *   `theme`, built-in `palette` colors, built-in `layer` names, the special `color` `ORIGEN`). The fix is a text edit
 *   built with `renameIssue`.
 * - Workspace file conventions (#230, ADR 0005): a file basename or a folder name at any depth. The fix is a rename of
 *   the path (`fix.rename`) built with `pathRenameIssue`.
 */
import type { Issue, TextRange } from './issue';

/** A row of every old -> new table: `kind` is the category (catalog value) or the path kind (file, folder). */
export interface Rename<Kind extends string = string> {
  old: string;
  new: string;
  kind: Kind;
}

export type CatalogCategory = 'motion' | 'effect' | 'state' | 'theme' | 'palette' | 'layer' | 'color';

const pair = (kind: CatalogCategory, old: string, newValue: string): Rename<CatalogCategory> => ({ old, new: newValue, kind });

/**
 * Catalog values renamed to English. `aura` keeps its name. `palette` and `layer` rows are the names of the built-in
 * Themes: they only count as old when the old name is missing and the new one exists where it is looked up, so a user
 * Theme that declares its own `fondo` color or `borde` Layer is untouched.
 */
export const OLD_CATALOG_VALUES: readonly Rename<CatalogCategory>[] = Object.freeze([
  pair('motion', 'flujo', 'stream'),
  pair('motion', 'pulso', 'pulse'),
  pair('motion', 'respiracion', 'breathe'),
  pair('motion', 'giro', 'spin'),
  pair('effect', 'fundido', 'fade'),
  pair('effect', 'deslizar', 'slide'),
  pair('effect', 'escala', 'zoom'),
  pair('state', 'seleccionado', 'selected'),
  pair('state', 'atenuado', 'dimmed'),
  pair('state', 'foco', 'focus'),
  pair('state', 'fantasma', 'ghost'),
  pair('state', 'en-ruta', 'on-path'),
  pair('theme', 'alto-contraste', 'high-contrast'),
  pair('theme', 'claro-suave', 'soft-light'),
  pair('palette', 'fondo', 'background'),
  pair('palette', 'papel', 'paper'),
  pair('palette', 'tinta', 'ink'),
  pair('palette', 'marco', 'frame'),
  pair('palette', 'linea', 'stroke'),
  pair('palette', 'sombra', 'shadow'),
  pair('layer', 'puntos', 'dots'),
  pair('layer', 'forma', 'shape'),
  pair('layer', 'relleno', 'fill'),
  pair('layer', 'borde', 'border'),
  pair('layer', 'sombra', 'shadow'),
  pair('layer', 'pila', 'stack'),
  pair('layer', 'pila-borde', 'stack-border'),
  pair('layer', 'acento', 'accent'),
  pair('layer', 'linea', 'line'),
  pair('layer', 'fondo', 'background'),
  pair('layer', 'separador', 'separator'),
  pair('color', 'ORIGEN', 'ORIGIN'),
]);

/** Kind of a Workspace path whose old name is reported. */
export type RenamedConvention = Rename<'file' | 'folder'>;

/** Old Workspace file conventions: a file basename (`tema.dg`) or a folder name (`temas`), at any depth. */
export const RENAMED_CONVENTIONS: readonly RenamedConvention[] = Object.freeze([
  { old: 'tema.dg', new: 'theme.dg', kind: 'file' },
  { old: 'temas', new: 'themes', kind: 'folder' },
  { old: 'fuentes', new: 'fonts', kind: 'folder' },
]);

/** The new name of `written` if it is an old name of `kind` in `table`; `undefined` otherwise. */
export function oldRename<K extends string>(table: readonly Rename<K>[], kind: K, written: string): string | undefined {
  return table.find((r) => r.kind === kind && r.old === written)?.new;
}

/** An `error` Issue whose `fix` rewrites what is written in `range` with `newValue`. */
export function renameIssue(code: string, message: string, file: string, range: TextRange, newValue: string): Issue {
  return { code, severity: 'error', file, ...range.start, message, fix: { file, range, replacement: newValue } };
}

/** Common message of an old catalog value. */
export const oldValueMessage = (category: CatalogCategory, oldValue: string, newValue: string): string =>
  `'${oldValue}' is an old ${category} name; use '${newValue}'`;

/** The outermost segment of a `/` path that uses an old convention: a folder anywhere but the last segment, a file only as the last one. */
export function renameInPath(path: string): { index: number; rename: RenamedConvention } | undefined {
  const segments = path.split('/');
  for (const [index, name] of segments.entries()) {
    const isLast = index === segments.length - 1;
    const rename = RENAMED_CONVENTIONS.find((c) => c.old === name && (c.kind === 'folder' ? !isLast : isLast));
    if (rename !== undefined) return { index, rename };
  }
  return undefined;
}

/**
 * An `old-workspace-convention` error whose `fix` is a rename: `rename` is the new path of `oldPath`, and `range` and
 * `replacement` are an empty edit at 1:1 so a text-only consumer changes nothing.
 */
export function pathRenameIssue(oldPath: string, newPath: string, rename: RenamedConvention): Issue {
  return {
    code: 'old-workspace-convention',
    severity: 'error',
    file: oldPath,
    line: 1,
    column: 1,
    message: `The ${rename.kind} name '${rename.old}' is no longer used; the convention is '${rename.new}'`,
    hint: `rename '${oldPath}' to '${newPath}'`,
    fix: { file: oldPath, range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '', rename: newPath },
  };
}

/**
 * One `old-workspace-convention` error per file or folder that uses an old name. `routes` are Workspace-relative with
 * `/`. A path with several old names reports only the outermost (renaming it exposes the next one on the following
 * `validate`), so each `fix` path is valid when it is applied.
 */
export function obsoleteConventions(routes: readonly string[]): Issue[] {
  const views = new Set<string>();
  const issues: Issue[] = [];
  for (const path of routes) {
    const found = renameInPath(path);
    if (found === undefined) continue;
    const segments = path.split('/');
    const oldPath = segments.slice(0, found.index + 1).join('/');
    if (views.has(oldPath)) continue;
    views.add(oldPath);
    issues.push(pathRenameIssue(oldPath, [...segments.slice(0, found.index), found.rename.new].join('/'), found.rename));
  }
  return issues;
}
