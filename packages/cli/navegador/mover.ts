/**
 * Logica de "soltar un Nodo" de la pagina de `diagrams dev`, sin React ni DOM para poder probarla:
 * elige el hash del archivo de la Vista, envia la intencion y traduce el rechazo en un aviso
 * (un 409 por hash viejo ademas recarga el estado). No es parte de la interfaz del paquete.
 */
import type { EnviadorDePin } from 'shell';

export interface DatosParaMover {
  /** Archivo en que se declara cada Vista. */
  archivosDeVista: Record<string, string>;
  /** Hash del contenido de cada archivo del Workspace. */
  hashes: Record<string, string>;
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
    const actual = estado();
    const archivo = actual?.archivosDeVista[vista];
    const hash = archivo === undefined ? undefined : actual?.hashes[archivo];
    if (hash === undefined) {
      avisar('No se puede mover: la Vista no tiene archivo conocido');
      return false;
    }
    const r = await enviar({ vista, nodo: id, x, y, hash });
    if (r.ok) return true;
    avisar(r.desactualizado ? `El archivo cambio en disco; se recargo la Vista (${r.mensaje})` : `No se pudo mover el Pin: ${r.mensaje}`);
    if (r.desactualizado) await recargar().catch(() => undefined);
    return false;
  };
}
