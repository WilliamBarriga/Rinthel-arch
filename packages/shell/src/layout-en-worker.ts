/**
 * Layout detras de un Web Worker (ADR 0004). Dos mitades sobre un puerto de
 * mensajes: `adaptadorDeWorker(puerto)` (lado de la pagina, produce un
 * `AdaptadorDeLayout`) y `servirLayout(puerto)` (lado del Worker, ejecuta el
 * mismo `layoutView` que usa el build en Node). El puerto es un `Worker`, un
 * `MessagePort` o cualquier par en memoria con `postMessage` y `onmessage`.
 */
import type { Tema, VistaResuelta } from 'canonico';
import type { Geometria } from 'layout';

import type { AdaptadorDeLayout } from './vista-interactiva';

/** Lo minimo que se pide a un `Worker` o `MessagePort`. */
export interface PuertoDeMensajes {
  postMessage(mensaje: unknown): void;
  onmessage: ((evento: { data: unknown }) => void) | null;
}

export interface Peticion {
  id: number;
  vista: VistaResuelta;
  tema: Tema;
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
  return (vista, tema) =>
    new Promise<Geometria>((ok, fallo) => {
      const id = siguiente++;
      pendientes.set(id, { ok, fallo });
      const peticion: Peticion = { id, vista, tema };
      puerto.postMessage(peticion);
    });
}
