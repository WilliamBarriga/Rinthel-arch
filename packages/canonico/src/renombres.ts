/**
 * Renames of the public contract: old (Spanish) name -> new (English) name. An old name is never an alias: it is an
 * `error` Issue whose `fix` rewrites it. These tables are the only place that knows the pairs; adding a rename is one
 * row. Two families share the `Renombre` row:
 * - catalog values (#229 and the review of #226): a word written in a Theme or a View (`motion`, `effect`, `state`,
 *   `theme`, built-in `palette` colors, built-in `layer` names, the special `color` `ORIGEN`). The fix is a text edit
 *   built with `issueDeRenombre`.
 * - Workspace file conventions (#230, ADR 0005): a file basename or a folder name at any depth. The fix is a rename of
 *   the path (`fix.rename`) built with `issueDeRenombreDeRuta`.
 * Identifiers follow the host package (Spanish) until the internal migration; comments are English.
 */
import type { Issue, TextRange } from './issue';

/** A row of every old -> new table: `kind` is the category (catalog value) or the path kind (file, folder). */
export interface Renombre<Kind extends string = string> {
  old: string;
  new: string;
  kind: Kind;
}

export type CategoriaDeCatalogo = 'motion' | 'effect' | 'state' | 'theme' | 'palette' | 'layer' | 'color';

const par = (kind: CategoriaDeCatalogo, old: string, nuevo: string): Renombre<CategoriaDeCatalogo> => ({ old, new: nuevo, kind });

/**
 * Catalog values renamed to English. `aura` keeps its name. `palette` and `layer` rows are the names of the built-in
 * Themes: they only count as old when the old name is missing and the new one exists where it is looked up, so a user
 * Theme that declares its own `fondo` color or `borde` Layer is untouched.
 */
export const VALORES_DE_CATALOGO_ANTIGUOS: readonly Renombre<CategoriaDeCatalogo>[] = Object.freeze([
  par('motion', 'flujo', 'stream'),
  par('motion', 'pulso', 'pulse'),
  par('motion', 'respiracion', 'breathe'),
  par('motion', 'giro', 'spin'),
  par('effect', 'fundido', 'fade'),
  par('effect', 'deslizar', 'slide'),
  par('effect', 'escala', 'zoom'),
  par('state', 'seleccionado', 'selected'),
  par('state', 'atenuado', 'dimmed'),
  par('state', 'foco', 'focus'),
  par('state', 'fantasma', 'ghost'),
  par('state', 'en-ruta', 'on-path'),
  par('theme', 'alto-contraste', 'high-contrast'),
  par('theme', 'claro-suave', 'soft-light'),
  par('palette', 'fondo', 'background'),
  par('palette', 'papel', 'paper'),
  par('palette', 'tinta', 'ink'),
  par('palette', 'marco', 'frame'),
  par('palette', 'linea', 'stroke'),
  par('palette', 'sombra', 'shadow'),
  par('layer', 'puntos', 'dots'),
  par('layer', 'forma', 'shape'),
  par('layer', 'relleno', 'fill'),
  par('layer', 'borde', 'border'),
  par('layer', 'sombra', 'shadow'),
  par('layer', 'pila', 'stack'),
  par('layer', 'pila-borde', 'stack-border'),
  par('layer', 'acento', 'accent'),
  par('layer', 'linea', 'line'),
  par('layer', 'fondo', 'background'),
  par('layer', 'separador', 'separator'),
  par('color', 'ORIGEN', 'ORIGIN'),
]);

/** Kind of a Workspace path whose old name is reported. */
export type ConvencionRenombrada = Renombre<'file' | 'folder'>;

/** Old Workspace file conventions: a file basename (`tema.dg`) or a folder name (`temas`), at any depth. */
export const CONVENCIONES_RENOMBRADAS: readonly ConvencionRenombrada[] = Object.freeze([
  { old: 'tema.dg', new: 'theme.dg', kind: 'file' },
  { old: 'temas', new: 'themes', kind: 'folder' },
  { old: 'fuentes', new: 'fonts', kind: 'folder' },
]);

/** The new name of `escrito` if it is an old name of `kind` in `tabla`; `undefined` otherwise. */
export function renombreAntiguo<K extends string>(tabla: readonly Renombre<K>[], kind: K, escrito: string): string | undefined {
  return tabla.find((r) => r.kind === kind && r.old === escrito)?.new;
}

/** An `error` Issue whose `fix` rewrites what is written in `rango` with `nuevo`. */
export function issueDeRenombre(code: string, mensaje: string, archivo: string, rango: TextRange, nuevo: string): Issue {
  return { code, severity: 'error', file: archivo, ...rango.start, message: mensaje, fix: { file: archivo, range: rango, replacement: nuevo } };
}

/** Common message of an old catalog value. */
export const mensajeDeValorAntiguo = (categoria: CategoriaDeCatalogo, antiguo: string, nuevo: string): string =>
  `'${antiguo}' is an old ${categoria} name; use '${nuevo}'`;

/** The outermost segment of a `/` path that uses an old convention: a folder anywhere but the last segment, a file only as the last one. */
export function renombreEnRuta(ruta: string): { indice: number; renombre: ConvencionRenombrada } | undefined {
  const segmentos = ruta.split('/');
  for (const [indice, nombre] of segmentos.entries()) {
    const esUltimo = indice === segmentos.length - 1;
    const renombre = CONVENCIONES_RENOMBRADAS.find((c) => c.old === nombre && (c.kind === 'folder' ? !esUltimo : esUltimo));
    if (renombre !== undefined) return { indice, renombre };
  }
  return undefined;
}

/**
 * An `old-workspace-convention` error whose `fix` is a rename: `rename` is the new path of `antigua`, and `range` and
 * `replacement` are an empty edit at 1:1 so a text-only consumer changes nothing.
 */
export function issueDeRenombreDeRuta(antigua: string, nueva: string, renombre: ConvencionRenombrada): Issue {
  return {
    code: 'old-workspace-convention',
    severity: 'error',
    file: antigua,
    line: 1,
    column: 1,
    message: `The ${renombre.kind} name '${renombre.old}' is no longer used; the convention is '${renombre.new}'`,
    hint: `rename '${antigua}' to '${nueva}'`,
    fix: { file: antigua, range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '', rename: nueva },
  };
}

/**
 * One `old-workspace-convention` error per file or folder that uses an old name. `rutas` are Workspace-relative with
 * `/`. A path with several old names reports only the outermost (renaming it exposes the next one on the following
 * `validate`), so each `fix` path is valid when it is applied.
 */
export function convencionesObsoletas(rutas: readonly string[]): Issue[] {
  const vistas = new Set<string>();
  const issues: Issue[] = [];
  for (const ruta of rutas) {
    const hallado = renombreEnRuta(ruta);
    if (hallado === undefined) continue;
    const segmentos = ruta.split('/');
    const antigua = segmentos.slice(0, hallado.indice + 1).join('/');
    if (vistas.has(antigua)) continue;
    vistas.add(antigua);
    issues.push(issueDeRenombreDeRuta(antigua, [...segmentos.slice(0, hallado.indice), hallado.renombre.new].join('/'), hallado.renombre));
  }
  return issues;
}
