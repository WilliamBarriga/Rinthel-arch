/**
 * Adaptador en memoria del puerto del Workspace vivo (`PuertoDelWorkspaceVivo`): extiende `workspaceEnMemoria` de
 * `sesion` (archivos propios y Temas de `--theme-path`) con los hashes de los recursos (`.tsx`, fuentes) y los
 * observadores. Toda escritura, borrado o cambio externo avisa a los observadores, como lo haria el watcher del disco.
 */
import { workspaceEnMemoria } from 'sesion';
import type { ContenidoEnMemoria, WorkspaceEnMemoria } from 'sesion';

import type { PuertoDelWorkspaceVivo } from './workspace-vivo';

export interface WorkspaceVivoEnMemoria extends PuertoDelWorkspaceVivo, WorkspaceEnMemoria {
  /** Cambio hecho fuera de `dev` (editor, git): escribe o, con `undefined`, borra un archivo propio y avisa. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Cambia el hash de un recurso (`.tsx`, fuente) y avisa. */
  tocarRecurso(ruta: string, hash: string): void;
}

export interface ContenidoVivoEnMemoria extends ContenidoEnMemoria {
  /** Hash de cada recurso; sin el, el adaptador no conoce recursos (`recursos()` da `undefined`). */
  recursos?: Record<string, string>;
}

export function puertoEnMemoria({ recursos, ...contenido }: ContenidoVivoEnMemoria): WorkspaceVivoEnMemoria {
  const base = workspaceEnMemoria(contenido);
  let hashes = recursos === undefined ? undefined : { ...recursos };
  const observadores = new Set<() => void>();
  const avisar = (): void => {
    for (const alCambiar of [...observadores]) alCambiar();
  };
  const escribir = (ruta: string, texto: string): void => {
    base.escribir(ruta, texto);
    avisar();
  };
  const borrar = (ruta: string): void => {
    base.borrar(ruta);
    avisar();
  };
  return {
    ...base,
    escribir,
    borrar,
    recursos: () => (hashes === undefined ? undefined : { ...hashes }),
    observar(alCambiar) {
      observadores.add(alCambiar);
      return () => observadores.delete(alCambiar);
    },
    editarFuera: (ruta, texto) => (texto === undefined ? borrar(ruta) : escribir(ruta, texto)),
    tocarRecurso(ruta, hash) {
      hashes = { ...hashes, [ruta]: hash };
      avisar();
    },
  };
}
