/**
 * Lado del Worker de `adaptadorDeWorker` (ADR 0003): ejecuta `layoutConMetricas` (ELK) por un
 * puerto de mensajes. Archivo propio para que la pagina, que solo usa el adaptador, no
 * arrastre ELK al empaquetar.
 */
import { layoutConMetricas } from 'layout';
import type { OpcionesDeLayout } from 'layout';

import type { PuertoDeMensajes, Peticion, Respuesta } from './layout-en-worker';

/** Atiende las peticiones de `adaptadorDeWorker` en `puerto` con `layoutConMetricas`. En un Worker: `servirLayout(self)`. */
export function servirLayout(puerto: PuertoDeMensajes, opciones: Pick<OpcionesDeLayout, 'elk'> = {}): void {
  puerto.onmessage = ({ data }) => {
    const { id, vista, metricas } = data as Peticion;
    layoutConMetricas(vista, metricas, opciones).then(
      (geometria) => puerto.postMessage({ id, geometria } satisfies Respuesta),
      (error: unknown) => puerto.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies Respuesta),
    );
  };
}
