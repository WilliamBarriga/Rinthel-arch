/**
 * Arranque comun del navegador: lo que usa `dev.tsx` (pagina viva): useTamano,
 * hidratar iconos y montar la raiz. No es parte de la interfaz del paquete.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { hidratarIconos } from 'canonico';
import type { FuenteCanonica, IconProvider, Tema } from 'canonico';
import type { Geometria } from 'layout';

/** Tamano de la ventana, al dia con `resize`. */
export function useTamano(): { width: number; height: number } {
  const [tamano, setTamano] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const alCambiar = (): void => setTamano({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return tamano;
}

/** Lo que una entrada aporta: su fuente de datos. */
export interface DatosDeVista {
  fuente: FuenteCanonica;
  /** Clave de icono -> SVG inline. */
  iconos: Readonly<Record<string, string>>;
  /** Por Vista: nombre del Tema y geometria cacheada. */
  geometrias: Readonly<Record<string, { theme: string; geometry: Geometria }>>;
}

/** Lo que `VistaInteractiva` necesita de los datos, mas el Tema de la Vista dibujada (`undefined` si la Fuente no trae Temas). */
export function usePropsDeDatos(
  { fuente, iconos, geometrias }: DatosDeVista,
  vista: string,
): { icons: IconProvider; cachedGeometries: Record<string, Geometria>; theme: Tema | undefined; width: number; height: number } {
  const icons = useMemo(() => hidratarIconos(iconos), [iconos]);
  const cachedGeometries = useMemo(
    () => Object.fromEntries(Object.entries(geometrias).map(([id, { geometry }]) => [id, geometry])),
    [geometrias],
  );
  const nombreDelTema = geometrias[vista]?.theme;
  const theme = fuente.themes.find(({ name }) => name === nombreDelTema) ?? fuente.themes[0];
  return { icons, cachedGeometries, theme, ...useTamano() };
}

/** Monta la aplicacion en `#raiz`. */
export function montar(app: ReactElement): void {
  createRoot(document.getElementById('raiz') as HTMLElement).render(app);
}
