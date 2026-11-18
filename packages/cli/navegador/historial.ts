/** Atajos de deshacer/rehacer de la pagina de `dev`, sin React ni DOM. */
import { avisarRechazo } from './cliente';
import type { ResultadoDeEnvio } from './cliente';

export type AccionDeHistorial = 'deshacer' | 'rehacer';

export interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Autorepeticion: no dispara el atajo. */
  repeat: boolean;
  /** En un campo de texto manda el deshacer propio del navegador. */
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
