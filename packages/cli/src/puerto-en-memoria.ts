/**
 * Adaptador en memoria del puerto del Workspace (`PuertoDelWorkspaceVivo`, que extiende `PuertoDeWorkspace` de
 * `sesion`): el par del adaptador de disco de `dev`. Guarda los archivos propios del Workspace, los Temas de
 * `--theme-path` (se leen, nunca se escriben) y, si se dan, los hashes de los recursos (`.tsx`, fuentes).
 * Toda escritura, borrado o cambio externo avisa a los observadores, como lo haria el watcher del disco.
 */
import type { ArchivosDelWorkspace } from 'dsl';

import type { PuertoDelWorkspaceVivo } from './workspace-vivo';

export interface WorkspaceEnMemoria extends PuertoDelWorkspaceVivo {
  /** Texto vigente de un archivo propio (`undefined` si no existe). */
  texto(ruta: string): string | undefined;
  /** Cambio hecho fuera de `dev` (editor, git): escribe o, con `undefined`, borra un archivo propio y avisa. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Cambia el hash de un recurso (`.tsx`, fuente) y avisa. */
  tocarRecurso(ruta: string, hash: string): void;
}

export interface ContenidoEnMemoria {
  propios: ArchivosDelWorkspace;
  /** Temas de `--theme-path`: se fusionan antes de los propios (que ganan en rutas repetidas). */
  temas?: ArchivosDelWorkspace;
  /** Hash de cada recurso; sin el, el adaptador no conoce recursos (`recursos()` da `undefined`). */
  recursos?: Record<string, string>;
}

export function puertoEnMemoria({ propios, temas = {}, recursos }: ContenidoEnMemoria): WorkspaceEnMemoria {
  let archivos: Record<string, string> = { ...propios };
  let hashes = recursos === undefined ? undefined : { ...recursos };
  const observadores = new Set<() => void>();
  const avisar = (): void => {
    for (const alCambiar of [...observadores]) alCambiar();
  };
  const poner = (ruta: string, texto: string | undefined): void => {
    if (texto === undefined) {
      const { [ruta]: _quitado, ...resto } = archivos;
      archivos = resto;
    } else archivos = { ...archivos, [ruta]: texto };
    avisar();
  };
  return {
    leer: () => ({ disco: { ...temas, ...archivos }, propios: { ...archivos } }),
    escribir: (ruta, texto) => poner(ruta, texto),
    borrar: (ruta) => poner(ruta, undefined),
    recursos: () => (hashes === undefined ? undefined : { ...hashes }),
    observar(alCambiar) {
      observadores.add(alCambiar);
      return () => observadores.delete(alCambiar);
    },
    texto: (ruta) => archivos[ruta],
    editarFuera: poner,
    tocarRecurso(ruta, hash) {
      hashes = { ...hashes, [ruta]: hash };
      avisar();
    },
  };
}
