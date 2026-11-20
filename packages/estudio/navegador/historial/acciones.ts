/** Deshacer, rehacer y saltar en el Historial de `dev`, sin React ni DOM. Las teclas viven en el registro de comandos. */
import { avisarRechazo } from '../cliente';
import type { ClienteDeDev, ResultadoDeEnvio } from '../cliente';

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

/** Un paso del Historial: deshacer, rehacer o saltar a la entrada `id` (0: Inicio). */
export type MovimientoDelHistorial = AccionDeHistorial | { saltar: number };

export interface DependenciasDelHistorial {
  cliente: Pick<ClienteDeDev, 'deshacer' | 'rehacer' | 'saltar'>;
  /** Vacia el guardado pendiente del editor. */
  vaciarGuardado: () => Promise<void>;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

/** Unico camino de la UI al Historial de `dev`: antes vacia el guardado pendiente, para no operar sobre un estado viejo. */
export async function moverElHistorial({ cliente, vaciarGuardado, avisar, recargar }: DependenciasDelHistorial, movimiento: MovimientoDelHistorial): Promise<void> {
  await vaciarGuardado();
  if (typeof movimiento === 'object') {
    const r = await cliente.saltar(movimiento.saltar);
    if (!r.ok) await avisarRechazo(r, 'No se pudo saltar', { avisar, recargar });
    return;
  }
  await crearAlAtajo({ enviar: (a) => (a === 'deshacer' ? cliente.deshacer() : cliente.rehacer()), avisar, recargar })(movimiento);
}
