/**
 * Control de edicion del shell: conecta las Intenciones y el historial de `sesion`
 * (ADR 0007) a una superficie con estado para la UI (atajos de deshacer/rehacer).
 * El estado vive aqui; la logica es la pura de `sesion`.
 */
import { crearHistorial, deshacer, editarEnHistorial, rehacer } from 'sesion';
import type { Historial, Intencion, MotivoDeRechazo } from 'sesion';

type Archivos = Historial['archivos'];

export type ResultadoDeEdicion = { ok: true } | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

export interface ControlDeEdicion {
  /** Texto vigente del Workspace tras las ediciones, deshaceres y rehaceres. */
  archivos(): Archivos;
  aplicar(intencion: Intencion): ResultadoDeEdicion;
  /** `false` si no habia nada que deshacer. */
  deshacer(): boolean;
  rehacer(): boolean;
  puedeDeshacer(): boolean;
  puedeRehacer(): boolean;
}

export function crearControlDeEdicion(archivos: Archivos): ControlDeEdicion {
  let historial: Historial = crearHistorial(archivos);
  const ir = (siguiente: Historial | undefined): boolean => {
    if (siguiente === undefined) return false;
    historial = siguiente;
    return true;
  };
  return {
    archivos: () => historial.archivos,
    aplicar(intencion) {
      const r = editarEnHistorial(historial, intencion);
      if (!r.ok) return r;
      historial = r.historial;
      return { ok: true };
    },
    deshacer: () => ir(deshacer(historial)),
    rehacer: () => ir(rehacer(historial)),
    puedeDeshacer: () => historial.pasado.length > 0,
    puedeRehacer: () => historial.futuro.length > 0,
  };
}
