/**
 * Entrada de navegador del HTML autocontenido (`export --format html`). Se
 * bundlea en un IIFE que el HTML incrusta una sola vez y que cumple dos
 * bundle de la pagina: monta el shell. El layout (ELK) va en otro bundle, el de
 * `worker.ts`, que la pagina recibe como texto y corre en un Web Worker. No es
 * parte de la interfaz del paquete: la lee `html.ts`.
 */
import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import type { FuenteCanonica } from 'canonico';
import type { Geometria } from 'layout';
import { VistaInteractiva, adaptadorDeWorker, hashDelNavegador, useEstadoEnHash } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

import { montar, usePropsDeDatos } from './arranque';

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

/** Puerto en memoria: `self` del codigo del Worker corrido en el hilo principal (el layout no muta lo que recibe, asi que no se copian los mensajes). */
function layoutEnHiloPrincipal(codigo: string): AdaptadorDeLayout {
  const crear = (): PuertoDeMensajes & { destino?: PuertoDeMensajes } => {
    const puerto: PuertoDeMensajes & { destino?: PuertoDeMensajes } = {
      onmessage: null,
      postMessage(mensaje) {
        setTimeout(() => puerto.destino?.onmessage?.({ data: mensaje }), 0);
      },
    };
    return puerto;
  };
  const [pagina, servidor] = [crear(), crear()];
  pagina.destino = servidor;
  servidor.destino = pagina;
  // El IIFE del Worker usa `self` como puerto; aqui se le da el del lado del servidor.
  new Function('self', codigo)(servidor);
  return adaptadorDeWorker(pagina);
}

/** Layout en un Worker creado desde `codigo`; si no se puede (o falla), el mismo codigo en el hilo principal. */
function crearLayout(codigo: string): AdaptadorDeLayout {
  let enPrincipal: AdaptadorDeLayout | undefined;
  const directo: AdaptadorDeLayout = (vista, tema) => (enPrincipal ??= layoutEnHiloPrincipal(codigo))(vista, tema);
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

function App({ datos, layout }: { datos: DatosDelHtml; layout: AdaptadorDeLayout }): ReactElement {
  const hash = useMemo(() => hashDelNavegador(window), []);
  const estado = useEstadoEnHash({ source: datos.fuente, hash, defaultView: datos.vista, camera: true });
  const { icons, cachedGeometries, theme, width, height } = usePropsDeDatos(
    { fuente: datos.fuente, iconos: datos.iconos, geometrias: datos.geometrias },
    estado.view,
  );
  useEffect(() => {
    document.title = estado.view;
  }, [estado.view]);
  const fondo = theme?.tokens['background'];
  useEffect(() => {
    if (fondo !== undefined) document.body.style.background = fondo;
  }, [fondo]);
  if (theme === undefined) throw new Error('La Fuente canonica no trae Temas');
  return (
    <VistaInteractiva {...estado} source={datos.fuente} theme={theme} layout={layout} icons={icons} width={width} height={height} cachedGeometries={cachedGeometries} />
  );
}

const datos = JSON.parse(document.getElementById('datos')?.textContent ?? 'null') as DatosDelHtml;
const codigoDelWorker = document.getElementById('worker')?.textContent ?? '';
montar(<App datos={datos} layout={crearLayout(codigoDelWorker)} />);
