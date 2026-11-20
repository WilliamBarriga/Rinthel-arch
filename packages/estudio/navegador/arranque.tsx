import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { hidratarIconos } from 'canonico';
import type { FuenteCanonica, Geometria, IconProvider, Tema } from 'canonico';

export function useTamano(): { width: number; height: number } {
  const [tamano, setTamano] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const alCambiar = (): void => setTamano({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return tamano;
}

export interface DatosDeVista {
  fuente: FuenteCanonica;
  iconos: Readonly<Record<string, string>>;
  /** Solo las que llegaron; las demas las calcula el Worker. */
  geometrias: Readonly<Record<string, { theme: string; geometry: Geometria }>>;
}

/** `theme` es `undefined` si la Fuente no trae Temas. */
export function usePropsDeDatos(
  { fuente, iconos, geometrias }: DatosDeVista,
  vista: string,
): { icons: IconProvider; cachedGeometries: Record<string, Geometria>; theme: Tema | undefined; width: number; height: number } {
  const icons = useMemo(() => hidratarIconos(iconos), [iconos]);
  const cachedGeometries = useMemo(
    () => Object.fromEntries(Object.entries(geometrias).map(([id, { geometry }]) => [id, geometry])),
    [geometrias],
  );
  // El Tema lo declara la Vista; sin declararlo, el de su Geometria (la del servidor) o el primero.
  const nombreDelTema = fuente.views.find(({ id }) => id === vista)?.theme ?? geometrias[vista]?.theme;
  const theme = fuente.themes.find(({ name }) => name === nombreDelTema) ?? fuente.themes[0];
  return { icons, cachedGeometries, theme, ...useTamano() };
}

export function montar(app: ReactElement): void {
  createRoot(document.getElementById('raiz') as HTMLElement).render(app);
}
