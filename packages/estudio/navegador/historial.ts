/** Deshacer/rehacer del Historial de `dev`, sin React ni DOM. Las teclas viven en el registro de comandos. */
import { avisarRechazo } from './cliente';
import type { ResultadoDeEnvio } from './cliente';

export type AccionDeHistorial = 'deshacer' | 'rehacer';

export interface DependenciasDeAtajo {
  enviar: (accion: AccionDeHistorial) => Promise<ResultadoDeEnvio>;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

export function crearAlAtajo({ enviar, avisar, recargar }: DependenciasDeAtajo) {
  return async (accion: AccionDeHistorial): Promise<void> => {
    const r = await enviar(accion);
    if (!r.ok) await avisarRechazo(r, `No se pudo ${accion}`, { avisar, recargar });
  };
}
