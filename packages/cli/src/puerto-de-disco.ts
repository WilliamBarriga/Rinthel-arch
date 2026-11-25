/**
 * The live Workspace on disk, shared by `dev` and `export`: the disk port (`puertoDeDisco`), its default watcher and
 * the real clock. It has no HTTP: `dev.ts` serves it, `export.ts` reads it in process.
 */
import { existsSync, renameSync, rmSync, watch } from 'node:fs';

import type { PuertoDelWorkspaceVivo, Reloj } from 'sesion';

import { registroEnDisco } from './registro-en-disco';
import { leerConTemas } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerRecursos, leerRutas, leerWorkspace } from './workspace';

/** `setTimeout` como reloj del Workspace vivo. */
export const relojReal: Reloj = {
  programar(fn, ms) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

/** `fs.watch` recursivo; ignora carpetas ocultas (`.diagrams/`, `.git/`) y `node_modules`. */
function observarDisco(raiz: string, alCambiar: () => void): () => void {
  const observador = watch(raiz, { recursive: true }, (_evento, nombre) => {
    if (nombre !== null && nombre.split(/[\\/]/).some((parte) => parte.startsWith('.') || parte === 'node_modules')) return;
    alCambiar();
  });
  return () => observador.close();
}

/** Avisa de cualquier cambio bajo `raiz`; devuelve como dejar de observar. */
export type Observador = (raiz: string, alCambiar: () => void) => () => void;

/**
 * El Workspace vivo sobre el disco: los `.dg` de `workspace` (propios) fusionados tras los de `temas`, escritura atomica
 * bajo la raiz, recursos (`.tsx`, fuentes) de ambas carpetas, el observador (`fs.watch` recursivo por defecto) y el
 * Registro de actividad de `registro-en-disco.ts`.
 */
export function puertoDeDisco(workspace: string, { temas, observar = observarDisco }: { temas?: string; observar?: Observador } = {}): PuertoDelWorkspaceVivo {
  return {
    actividad: registroEnDisco(workspace),
    leer: () => ({ propios: leerWorkspace(workspace), disco: leerConTemas(leerWorkspace, workspace, temas) }),
    escribir: (ruta, texto) => escribirTexto(destinoEnWorkspace(workspace, ruta), texto),
    borrar: (ruta) => rmSync(destinoEnWorkspace(workspace, ruta), { force: true }),
    renombrar: (antigua, nueva) => renameSync(destinoEnWorkspace(workspace, antigua), destinoEnWorkspace(workspace, nueva)),
    existe: (ruta) => existsSync(destinoEnWorkspace(workspace, ruta)),
    rutas: () => leerRutas(workspace),
    recursos: () => ({ ...(temas === undefined ? {} : leerRecursos(temas)), ...leerRecursos(workspace) }),
    observar: (alCambiar) => observar(workspace, alCambiar),
  };
}
