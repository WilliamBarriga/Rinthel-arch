/** Props de datos de `VistaInteractiva` para la Vista activa: iconos, Geometrias cacheadas, Tema y tamano. */
import { useMemo } from 'react';

import { hydrateIcons } from 'canonical';
import type { CanonicalForm, Geometry, IconProvider, Theme } from 'canonical';

import { useTamano } from '../marco/use-tamano';

export interface DatosDeVista {
  fuente: CanonicalForm;
  iconos: Readonly<Record<string, string>>;
  /** Solo las que llegaron; las demas las calcula el Worker. */
  geometrias: Readonly<Record<string, { theme: string; geometry: Geometry }>>;
}

/** `theme` es `undefined` si la Fuente no trae Temas. */
export function usePropsDeDatos(
  { fuente, iconos, geometrias }: DatosDeVista,
  vista: string,
): { icons: IconProvider; cachedGeometries: Record<string, Geometry>; theme: Theme | undefined; width: number; height: number } {
  const icons = useMemo(() => hydrateIcons(iconos), [iconos]);
  const cachedGeometries = useMemo(
    () => Object.fromEntries(Object.entries(geometrias).map(([id, { geometry }]) => [id, geometry])),
    [geometrias],
  );
  // El Tema lo declara la Vista; sin declararlo, el de su Geometria (la del servidor) o el primero.
  const nombreDelTema = fuente.views.find(({ id }) => id === vista)?.theme ?? geometrias[vista]?.theme;
  const theme = fuente.themes.find(({ name }) => name === nombreDelTema) ?? fuente.themes[0];
  return { icons, cachedGeometries, theme, ...useTamano() };
}
