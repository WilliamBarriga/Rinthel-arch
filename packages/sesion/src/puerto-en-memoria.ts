import type { ArchivosDelWorkspace } from 'dsl';

import type { PuertoDeWorkspace } from './aplicar';

export interface WorkspaceEnMemoria extends PuertoDeWorkspace {
  /** Borra un archivo propio; uno ausente no es error. */
  borrar(ruta: string): void;
  /** Texto vigente de un archivo propio (`undefined` si no existe). */
  texto(ruta: string): string | undefined;
  /** Escritura ajena a un archivo de `--theme-path` (para pruebas); `undefined` lo borra. Nunca lo usa `aplicarAlWorkspace`. */
  escribirTema(ruta: string, texto: string | undefined): void;
}

export interface ContenidoEnMemoria {
  propios: ArchivosDelWorkspace;
  /** Temas de `--theme-path`: se fusionan antes de los propios (que ganan en rutas repetidas). */
  temas?: ArchivosDelWorkspace;
}

/** `escribir` y `borrar` solo tocan los propios. */
export function workspaceEnMemoria({ propios, temas: temasIniciales = {} }: ContenidoEnMemoria): WorkspaceEnMemoria {
  let archivos: Record<string, string> = { ...propios };
  let temas: Record<string, string> = { ...temasIniciales };
  return {
    leer: () => ({ disco: { ...temas, ...archivos }, propios: { ...archivos } }),
    escribir(ruta, texto) {
      archivos = { ...archivos, [ruta]: texto };
    },
    borrar(ruta) {
      const { [ruta]: _quitado, ...resto } = archivos;
      archivos = resto;
    },
    texto: (ruta) => archivos[ruta],
    escribirTema(ruta, texto) {
      const { [ruta]: _previo, ...resto } = temas;
      temas = texto === undefined ? resto : { ...resto, [ruta]: texto };
    },
  };
}
