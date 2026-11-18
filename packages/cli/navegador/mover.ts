/**
 * Gestos de la pagina de `diagrams dev` que escriben (soltar un Nodo, reordenar Lifelines), sin React ni DOM para
 * poder probarlos: arman la Intencion, la envian con la version del estado que vio la pagina (`editar` del cliente;
 * el servidor la traduce a `visto`) y traducen el rechazo en un aviso (un 409 por texto desactualizado ademas
 * recarga el estado). No es parte de la interfaz del paquete.
 */
import type { Intencion } from 'canonico';

import { avisarRechazo } from './cliente';
import type { ResultadoDeEnvio } from './cliente';

export interface DatosParaMover {
  /** Version del estado que esta viendo la pagina. */
  version: number;
}

export interface DependenciasDeMover {
  /** Estado vigente en el momento de soltar (no el del render). */
  estado: () => DatosParaMover | undefined;
  /** `editar` del cliente de `dev`. */
  enviar: (intencion: Intencion, version: number) => Promise<ResultadoDeEnvio>;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

/** Envia `intencion` con la version vigente; resuelve `false` (y avisa con `fallo`) si se rechazo. */
async function enviarGesto({ estado, enviar, avisar, recargar }: DependenciasDeMover, intencion: Intencion, sinEstado: string, fallo: string): Promise<boolean> {
  const version = estado()?.version;
  if (version === undefined) {
    avisar(sinEstado);
    return false;
  }
  const r = await enviar(intencion, version);
  if (r.ok) return true;
  await avisarRechazo(r, fallo, { avisar, recargar });
  return false;
}

/** Devuelve el manejador de arrastre soltado; resuelve `false` si se rechazo (el Nodo vuelve a su sitio). */
export function crearAlMover(dependencias: DependenciasDeMover) {
  return (vista: string, { id, x, y }: { id: string; x: number; y: number }): Promise<boolean> =>
    enviarGesto(dependencias, { tipo: 'mover-pin', vista, nodo: id, x, y }, 'No se puede mover: aun no hay estado del Workspace', 'No se pudo mover el Pin');
}

/** Como `crearAlMover`, para la Intencion `ordenar-lifelines` de una Vista de secuencia; resuelve `false` si se rechazo. */
export function crearAlOrdenar(dependencias: DependenciasDeMover) {
  return (vista: string, { orden }: { orden: string[] }): Promise<boolean> =>
    enviarGesto(dependencias, { tipo: 'ordenar-lifelines', vista, orden }, 'No se puede reordenar: aun no hay estado del Workspace', 'No se pudo reordenar las Lifelines');
}
