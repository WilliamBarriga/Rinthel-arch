/**
 * Atajos de deshacer/rehacer de la pagina de `diagrams dev` (ADR 0007), sin React ni DOM para poder
 * probarlos: traducen la tecla a una accion, la envian al servidor por el cliente de `dev` (que restaura el texto exacto) y
 * convierten un rechazo en aviso. No es parte de la interfaz del paquete.
 */
import type { ResultadoDeEnvio } from './cliente';

export type AccionDeHistorial = 'deshacer' | 'rehacer';

export interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Tecla mantenida pulsada (autorepeticion): no dispara el atajo. */
  repeat: boolean;
  /** El foco esta en un campo de texto: ahi manda el deshacer propio del navegador. */
  enCampoDeTexto: boolean;
}

/** Ctrl/Cmd+Z deshace; Ctrl/Cmd+Mayus+Z y Ctrl+Y rehacen. */
export function accionDeAtajo(t: TeclaPulsada): AccionDeHistorial | undefined {
  if (t.enCampoDeTexto || t.repeat || t.altKey || !(t.ctrlKey || t.metaKey)) return undefined;
  const tecla = t.key.toLowerCase();
  if (tecla === 'z') return t.shiftKey ? 'rehacer' : 'deshacer';
  if (tecla === 'y' && !t.shiftKey) return 'rehacer';
  return undefined;
}

export interface DependenciasDeAtajo {
  /** `deshacer` o `rehacer` del cliente de `dev` segun la accion. */
  enviar: (accion: AccionDeHistorial) => Promise<ResultadoDeEnvio>;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
}

export function crearAlAtajo({ enviar, avisar, recargar }: DependenciasDeAtajo) {
  return async (accion: AccionDeHistorial): Promise<void> => {
    const r = await enviar(accion);
    if (r.ok) return;
    avisar(r.desactualizado ? `El archivo cambio en disco; se recargo la Vista (${r.mensaje})` : `No se pudo ${accion}: ${r.mensaje}`);
    if (r.desactualizado) await recargar().catch(() => undefined);
  };
}
