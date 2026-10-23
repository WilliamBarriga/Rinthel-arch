/**
 * Lado del Worker de `adaptadorDeWorker` (ADR 0003): ejecuta `layoutView` (ELK) por un
 * puerto de mensajes. Archivo propio para que la pagina, que solo usa el adaptador, no
 * arrastre ELK al empaquetar.
 */
import { layoutView } from 'layout';
import type { Geometria, OpcionesDeLayout } from 'layout';

import type { PuertoDeMensajes, Peticion, Respuesta } from './layout-en-worker';

/** Atiende las peticiones de `adaptadorDeWorker` en `puerto` con `layoutView`. En un Worker: `servirLayout(self)`. */
export function servirLayout(puerto: PuertoDeMensajes, opciones: OpcionesDeLayout = {}): void {
  puerto.onmessage = ({ data }) => {
    const { id, vista, tema, medidas } = data as Peticion;
    layoutView(vista, tema, { ...opciones, ...(medidas !== undefined && { medidas }) }).then(
      (geometria) => puerto.postMessage({ id, geometria } satisfies Respuesta),
      (error: unknown) => puerto.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies Respuesta),
    );
  };
}
