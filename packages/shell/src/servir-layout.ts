/** Lado del Worker de `adaptadorDeWorker`. Archivo propio para que la pagina no arrastre ELK al empaquetar. */
import { layoutWithMetrics } from 'layout';
import type { LayoutOptions } from 'layout';

import type { PuertoDeMensajes, Peticion, Respuesta } from './layout-en-worker';

/** Atiende en `puerto` las peticiones de `adaptadorDeWorker`; en un Worker, `servirLayout(self)`. */
export function servirLayout(puerto: PuertoDeMensajes, opciones: Pick<LayoutOptions, 'elk'> = {}): void {
  puerto.onmessage = ({ data }) => {
    const { id, vista, metricas } = data as Peticion;
    layoutWithMetrics(vista, metricas, opciones).then(
      (geometria) => puerto.postMessage({ id, geometria } satisfies Respuesta),
      (error: unknown) => puerto.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies Respuesta),
    );
  };
}
