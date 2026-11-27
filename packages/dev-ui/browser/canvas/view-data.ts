/** Data props of `InteractiveView` for the active View: icons, cached Geometries, Theme and size. */
import { useMemo } from 'react';

import { hydrateIcons } from 'canonical';
import type { CanonicalForm, Geometry, IconProvider, Theme } from 'canonical';

import { useSize } from '../frame/use-size';

export interface ViewData {
  source: CanonicalForm;
  icons: Readonly<Record<string, string>>;
  /** Only the ones that arrived; the Worker computes the rest. */
  geometries: Readonly<Record<string, { theme: string; geometry: Geometry }>>;
}

/** `theme` is `undefined` if the Source has no Themes. */
export function useDataProps(
  { source, icons, geometries }: ViewData,
  view: string,
): { icons: IconProvider; cachedGeometries: Record<string, Geometry>; theme: Theme | undefined; width: number; height: number } {
  const iconProvider = useMemo(() => hydrateIcons(icons), [icons]);
  const cachedGeometries = useMemo(
    () => Object.fromEntries(Object.entries(geometries).map(([id, { geometry }]) => [id, geometry])),
    [geometries],
  );
  // The View declares the Theme; otherwise the one of its Geometry (the server's) or the first one.
  const themeName = source.views.find(({ id }) => id === view)?.theme ?? geometries[view]?.theme;
  const theme = source.themes.find(({ name }) => name === themeName) ?? source.themes[0];
  return { icons: iconProvider, cachedGeometries, theme, ...useSize() };
}
