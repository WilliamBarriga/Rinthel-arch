/**
 * Entrada de navegador del HTML autocontenido (`export --format html`). Se
 * bundlea en un IIFE que el HTML incrusta una sola vez y que cumple dos
 * papeles segun donde corra: en la pagina monta el shell; dentro del Web
 * Worker (el mismo codigo, via Blob) sirve el layout. No es parte de la
 * interfaz del paquete: la lee `html.ts`.
 */
import { rolWorker } from './preludio';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import type { FuenteCanonica, IconProvider } from 'canonico';
import { layoutView } from 'layout';
import type { Geometria } from 'layout';
import { VistaInteractiva, adaptadorDeWorker, hashDelNavegador, servirLayout, useEstadoEnHash } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

/** Lo que `html.ts` serializa en `<script id="datos" type="application/json">`. */
export interface DatosDelHtml {
  fuente: FuenteCanonica;
  /** Vista con la que abre este archivo (el hash puede decir otra). */
  vista: string;
  /** Por Vista: nombre del Tema y geometria del estado por defecto (la del build). */
  geometrias: Record<string, { theme: string; geometry: Geometria }>;
  /** Clave de icono -> SVG inline. */
  iconos: Record<string, string>;
}

/** Layout en un Worker creado desde el propio bundle; si no se puede (o falla), en el hilo principal. */
function crearLayout(codigo: string): AdaptadorDeLayout {
  const directo: AdaptadorDeLayout = (vista, tema) => layoutView(vista, tema);
  let enWorker: AdaptadorDeLayout | undefined;
  const reintentos = new Set<() => void>();
  try {
    const worker = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })));
    enWorker = adaptadorDeWorker(worker as unknown as PuertoDeMensajes);
    worker.onerror = () => {
      enWorker = undefined;
      for (const reintentar of [...reintentos]) reintentar();
      reintentos.clear();
    };
  } catch {
    enWorker = undefined;
  }
  return (vista, tema) => {
    const worker = enWorker;
    if (worker === undefined) return directo(vista, tema);
    return new Promise((ok, fallo) => {
      const reintentar = (): void => void directo(vista, tema).then(ok, fallo);
      reintentos.add(reintentar);
      worker(vista, tema).then(
        (geometria) => {
          reintentos.delete(reintentar);
          ok(geometria);
        },
        (error: unknown) => {
          reintentos.delete(reintentar);
          fallo(error);
        },
      );
    });
  };
}

function useTamano(): { width: number; height: number } {
  const [tamano, setTamano] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const alCambiar = (): void => setTamano({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return tamano;
}

function App({ datos, layout }: { datos: DatosDelHtml; layout: AdaptadorDeLayout }): ReactElement {
  const hash = useMemo(() => hashDelNavegador(window), []);
  const estado = useEstadoEnHash({ source: datos.fuente, hash, defaultView: datos.vista, camera: true });
  const { width, height } = useTamano();
  const iconos = useMemo<IconProvider>(
    () => ({ resolve: (clave) => datos.iconos[clave], keys: () => Object.keys(datos.iconos) }),
    [datos],
  );
  const cachedGeometries = useMemo(
    () => Object.fromEntries(Object.entries(datos.geometrias).map(([id, { geometry }]) => [id, geometry])),
    [datos],
  );
  const nombreDelTema = datos.geometrias[estado.view]?.theme;
  const theme = datos.fuente.themes.find(({ name }) => name === nombreDelTema) ?? datos.fuente.themes[0];
  useEffect(() => {
    document.title = estado.view;
  }, [estado.view]);
  if (theme === undefined) throw new Error('La Fuente canonica no trae Temas');
  return (
    <VistaInteractiva {...estado} source={datos.fuente} theme={theme} layout={layout} icons={iconos} width={width} height={height} cachedGeometries={cachedGeometries} />
  );
}

if (rolWorker) {
  servirLayout(self as unknown as PuertoDeMensajes);
} else {
  const datos = JSON.parse(document.getElementById('datos')?.textContent ?? 'null') as DatosDelHtml;
  const codigo = document.getElementById('app')?.textContent ?? '';
  createRoot(document.getElementById('raiz') as HTMLElement).render(<App datos={datos} layout={crearLayout(codigo)} />);
}
