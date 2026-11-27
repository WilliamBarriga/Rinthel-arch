/**
 * What the `dev` viewer must redo between the last good state and the new one. Pure.
 * - `estructura`: the layout changes (Model, Views, Metrics of each View's Theme) or a font file;
 *   touching only `theme`/`themePatch` of a View with equal Metrics does not count.
 * - `codigo`: a `.tsx` changes and nothing stronger.
 * - `pintura`: everything else; the Resolved style is reapplied without relayout.
 */
import type { CanonicalForm, ChangeKind } from 'canonical';
import { TEMA_NEUTRO, claveDeMetricas, tablaDeMetricas } from 'tema';

/** `resources`: hash of each `.tsx` and font file. */
export interface DevSnapshot {
  source: CanonicalForm | undefined;
  resources: Readonly<Record<string, string>>;
}

const CODE_EXTENSION = '.tsx';

const changedIn = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>, wants: (path: string) => boolean): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].some((path) => wants(path) && a[path] !== b[path]);

/** Everything except the Themes and, per View, the Metrics of its Theme. */
function structureKey(source: CanonicalForm): string {
  const themeOf = (name: string | undefined) => source.themes.find((t) => t.name === (name ?? TEMA_NEUTRO.name)) ?? TEMA_NEUTRO;
  return JSON.stringify({
    specification: source.specification,
    model: source.model,
    views: source.views.map(({ theme, themePatch: _patch, ...rest }) => [rest, claveDeMetricas(tablaDeMetricas(themeOf(theme), rest.type))]),
  });
}

export function classifyChange(before: DevSnapshot, after: DevSnapshot & { source: CanonicalForm }): ChangeKind {
  if (before.source === undefined) return 'estructura';
  if (structureKey(before.source) !== structureKey(after.source)) return 'estructura';
  if (changedIn(before.resources, after.resources, (path) => !path.endsWith(CODE_EXTENSION))) return 'estructura';
  if (changedIn(before.resources, after.resources, (path) => path.endsWith(CODE_EXTENSION))) return 'codigo';
  return 'pintura';
}
