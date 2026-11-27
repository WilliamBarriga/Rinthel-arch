/**
 * The live Workspace on disk, shared by `dev` and `export`: the disk port (`puertoDeDisco`), its default watcher and
 * the real clock. It has no HTTP: `dev.ts` serves it, `export.ts` reads it in process.
 */
import { existsSync, renameSync, rmSync, watch } from 'node:fs';

import type { LiveWorkspacePort, Clock } from 'session';

import { registroEnDisco } from './registro-en-disco';
import { leerConTemas } from './sesion-cli';
import { destinoEnWorkspace, escribirTexto, leerRecursos, leerRutas, leerWorkspace } from './workspace';

/** `setTimeout` como reloj del Workspace vivo. */
export const relojReal: Clock = {
  schedule(fn, ms) {
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
export function puertoDeDisco(workspace: string, { temas, observar = observarDisco }: { temas?: string; observar?: Observador } = {}): LiveWorkspacePort {
  return {
    activity: registroEnDisco(workspace),
    read: () => ({ own: leerWorkspace(workspace), disk: leerConTemas(leerWorkspace, workspace, temas) }),
    write: (ruta, texto) => escribirTexto(destinoEnWorkspace(workspace, ruta), texto),
    remove: (ruta) => rmSync(destinoEnWorkspace(workspace, ruta), { force: true }),
    renamePath: (antigua, nueva) => renameSync(destinoEnWorkspace(workspace, antigua), destinoEnWorkspace(workspace, nueva)),
    exists: (ruta) => existsSync(destinoEnWorkspace(workspace, ruta)),
    paths: () => leerRutas(workspace),
    resources: () => ({ ...(temas === undefined ? {} : leerRecursos(temas)), ...leerRecursos(workspace) }),
    watch: (alCambiar) => observar(workspace, alCambiar),
  };
}
