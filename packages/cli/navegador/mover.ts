/** Gestos de la pagina de `dev` que escriben, sin React ni DOM; envian la version del estado que vio la pagina. */
import type { Intencion } from 'canonico';

import { avisarRechazo } from './cliente';
import type { ResultadoDeEnvio } from './cliente';

export interface DatosParaMover {
  version: number;
}

export interface DependenciasDeMover {
  /** Estado vigente en el momento de soltar (no el del render). */
  estado: () => DatosParaMover | undefined;
  enviar: (intencion: Intencion, version: number) => Promise<ResultadoDeEnvio>;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

/** Resuelve `false` (y avisa con `fallo`) si se rechazo. */
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

/** El manejador resuelve `false` si se rechazo (el Nodo vuelve a su sitio). */
export function crearAlMover(dependencias: DependenciasDeMover) {
  return (vista: string, { id, x, y }: { id: string; x: number; y: number }): Promise<boolean> =>
    enviarGesto(dependencias, { tipo: 'mover-pin', vista, nodo: id, x, y }, 'No se puede mover: aun no hay estado del Workspace', 'No se pudo mover el Pin');
}

/** Como `crearAlMover`, para `ordenar-lifelines`. */
export function crearAlOrdenar(dependencias: DependenciasDeMover) {
  return (vista: string, { orden }: { orden: string[] }): Promise<boolean> =>
    enviarGesto(dependencias, { tipo: 'ordenar-lifelines', vista, orden }, 'No se puede reordenar: aun no hay estado del Workspace', 'No se pudo reordenar las Lifelines');
}
