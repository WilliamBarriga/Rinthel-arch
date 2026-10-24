/**
 * Layout detras de un Web Worker (ADR 0003). Dos mitades sobre un puerto de
 * mensajes: `adaptadorDeWorker(puerto)` (lado de la pagina, produce un
 * `AdaptadorDeLayout`) y `servirLayout(puerto)` (lado del Worker, ejecuta el
 * mismo nucleo (`layoutConMetricas`) que `layoutView` en Node). El puerto es un `Worker`, un
 * `MessagePort` o cualquier par en memoria con `postMessage` y `onmessage`.
 */
import type { VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';
import { tablaDeMetricas } from 'tema';
import type { TablaDeMetricas } from 'tema';

import type { AdaptadorDeLayout } from './vista-interactiva';

/** Lo minimo que se pide a un `Worker` o `MessagePort`. */
export interface PuertoDeMensajes {
  postMessage(mensaje: unknown): void;
  onmessage: ((evento: { data: unknown }) => void) | null;
}

export interface Peticion {
  id: number;
  vista: VistaResuelta;
  /** Metricas ya resueltas (el Tema se valida una vez, en la pagina): el Worker no empaqueta el esquema del Tema. */
  metricas: TablaDeMetricas;
}
export type Respuesta = { id: number; geometria: Geometria } | { id: number; error: string };

/** Adaptador de layout que delega en el Worker del otro extremo del `puerto`. Una peticion por llamada; las respuestas se casan por id. */
export function adaptadorDeWorker(puerto: PuertoDeMensajes): AdaptadorDeLayout {
  let siguiente = 0;
  const pendientes = new Map<number, { ok: (g: Geometria) => void; fallo: (e: Error) => void }>();
  puerto.onmessage = ({ data }) => {
    const respuesta = data as Respuesta;
    const espera = pendientes.get(respuesta.id);
    if (espera === undefined) return;
    pendientes.delete(respuesta.id);
    if ('error' in respuesta) espera.fallo(new Error(respuesta.error));
    else espera.ok(respuesta.geometria);
  };
  return (vista, tema, medidas) =>
    new Promise<Geometria>((ok, fallo) => {
      const id = siguiente++;
      pendientes.set(id, { ok, fallo });
      puerto.postMessage({ id, vista, metricas: tablaDeMetricas(tema, medidas) } satisfies Peticion);
    });
}
