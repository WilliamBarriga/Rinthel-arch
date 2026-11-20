/** Toda escritura, borrado o cambio externo avisa a los observadores, como el watcher del disco. */
import { workspaceEnMemoria } from './puerto-en-memoria';
import type { ContenidoEnMemoria, WorkspaceEnMemoria } from './puerto-en-memoria';

import type { PuertoDelWorkspaceVivo } from './workspace-vivo';

export interface WorkspaceVivoEnMemoria extends PuertoDelWorkspaceVivo, WorkspaceEnMemoria {
  /** Cambio hecho fuera de `dev`; con `undefined` borra el archivo. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Cambio hecho fuera de `dev` en un archivo de `--theme-path`; avisa como el watcher. */
  editarTemaFuera(ruta: string, texto: string | undefined): void;
  tocarRecurso(ruta: string, hash: string): void;
  /** Anexa texto al Registro de actividad (como el CLI de otro proceso) y avisa a su observador. */
  anexarActividad(texto: string): void;
  /** Reemplaza el registro entero (acortado o rotado); `undefined` lo borra. */
  reescribirActividad(texto: string | undefined): void;
}

export interface ContenidoVivoEnMemoria extends ContenidoEnMemoria {
  /** Sin el, `recursos()` da `undefined`. */
  recursos?: Record<string, string>;
  /** Texto inicial de `.diagrams/actividad.jsonl`; sin el, el registro no existe todavia. */
  actividad?: string;
  /** Toda escritura propia lanza un `Error` con este mensaje (fallo de I/O); `editarFuera` sigue escribiendo. */
  escrituraRota?: string;
}

export function puertoEnMemoria({ recursos, actividad, escrituraRota, ...contenido }: ContenidoVivoEnMemoria): WorkspaceVivoEnMemoria {
  const base = workspaceEnMemoria(contenido);
  let registro = actividad;
  const observadoresDelRegistro = new Set<() => void>();
  const cambiarRegistro = (texto: string | undefined): void => {
    registro = texto;
    for (const alCambiar of [...observadoresDelRegistro]) alCambiar();
  };
  let hashes = recursos === undefined ? undefined : { ...recursos };
  const observadores = new Set<() => void>();
  const avisar = (): void => {
    for (const alCambiar of [...observadores]) alCambiar();
  };
  const escribirFuera = (ruta: string, texto: string): void => {
    base.escribir(ruta, texto);
    avisar();
  };
  const escribir = (ruta: string, texto: string): void => {
    if (escrituraRota !== undefined) throw new Error(escrituraRota);
    escribirFuera(ruta, texto);
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
    editarFuera: (ruta, texto) => (texto === undefined ? borrar(ruta) : escribirFuera(ruta, texto)),
    editarTemaFuera(ruta, texto) {
      base.escribirTema(ruta, texto);
      avisar();
    },
    actividad: {
      leer: () => registro,
      observar(alCambiar) {
        observadoresDelRegistro.add(alCambiar);
        return () => observadoresDelRegistro.delete(alCambiar);
      },
    },
    anexarActividad: (texto) => cambiarRegistro((registro ?? '') + texto),
    reescribirActividad: cambiarRegistro,
    tocarRecurso(ruta, hash) {
      hashes = { ...hashes, [ruta]: hash };
      avisar();
    },
  };
}
