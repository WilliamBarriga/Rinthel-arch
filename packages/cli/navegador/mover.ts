/**
 * Logica de "soltar un Nodo" de la pagina de `diagrams dev`, sin React ni DOM para poder probarla:
 * envia la intencion con la version del estado que vio la pagina (el servidor la traduce a `visto`) y
 * traduce el rechazo en un aviso (un 409 por texto desactualizado ademas recarga el estado). No es parte
 * de la interfaz del paquete.
 */
import type { EnviadorDeIntencion, EnviadorDePin } from 'shell';

export interface DatosParaMover {
  /** Version del estado que esta viendo la pagina. */
  version: number;
}

export interface DependenciasDeMover {
  /** Estado vigente en el momento de soltar (no el del render). */
  estado: () => DatosParaMover | undefined;
  enviar: EnviadorDePin;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

/** Devuelve el manejador de arrastre soltado; resuelve `false` si se rechazo (el Nodo vuelve a su sitio). */
export function crearAlMover({ estado, enviar, avisar, recargar }: DependenciasDeMover) {
  return async (vista: string, { id, x, y }: { id: string; x: number; y: number }): Promise<boolean> => {
    const version = estado()?.version;
    if (version === undefined) {
      avisar('No se puede mover: aun no hay estado del Workspace');
      return false;
    }
    const r = await enviar({ vista, nodo: id, x, y, version });
    if (r.ok) return true;
    avisar(r.desactualizado ? `El archivo cambio en disco; se recargo la Vista (${r.mensaje})` : `No se pudo mover el Pin: ${r.mensaje}`);
    if (r.desactualizado) await recargar().catch(() => undefined);
    return false;
  };
}

export interface DependenciasDeOrdenar extends Omit<DependenciasDeMover, 'enviar'> {
  enviar: EnviadorDeIntencion;
}

/** Como `crearAlMover`, para la Intencion `ordenar-lifelines` de una Vista de secuencia; resuelve `false` si se rechazo. */
export function crearAlOrdenar({ estado, enviar, avisar, recargar }: DependenciasDeOrdenar) {
  return async (vista: string, { orden }: { orden: string[] }): Promise<boolean> => {
    const version = estado()?.version;
    if (version === undefined) {
      avisar('No se puede reordenar: aun no hay estado del Workspace');
      return false;
    }
    const r = await enviar({ tipo: 'ordenar-lifelines', vista, orden, version });
    if (r.ok) return true;
    avisar(r.desactualizado ? `El archivo cambio en disco; se recargo la Vista (${r.mensaje})` : `No se pudo reordenar las Lifelines: ${r.mensaje}`);
    if (r.desactualizado) await recargar().catch(() => undefined);
    return false;
  };
}
