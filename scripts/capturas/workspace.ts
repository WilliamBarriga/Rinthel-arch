/**
 * Copia de un Workspace en `raizDeCache/workspace-<nombre>` (rehecha en cada llamada, sin `.diagrams/`) con un
 * `capturas.dg` que repite la Vista una vez por Tema: `view <vista>--<tema>`, sin `link`.
 * Errores: lanza si la Vista no esta en ningun `.dg` del Workspace.
 */
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { CARPETA_DE_SALIDA } from 'cli';

export interface WorkspacePreparado {
  directorio: string;
  vistaDe: (tema: string) => string;
}

const archivosDg = (raiz: string): string[] =>
  readdirSync(raiz, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.dg') && !relative(raiz, e.parentPath).split('/').includes(CARPETA_DE_SALIDA))
    .map((e) => join(e.parentPath, e.name));

/** Sin las llaves; salta cadenas y comentarios; `undefined` si no esta. */
export function cuerpoDeVista(texto: string, id: string): string | undefined {
  const inicio = new RegExp(`(^|\\s)view\\s+${id.replace(/[-.]/g, '\\$&')}\\s*\\{`).exec(texto);
  if (inicio === null) return undefined;
  const abre = inicio.index + inicio[0].length;
  let profundidad = 1;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      i = texto.indexOf('"', i + 1);
      if (i < 0) return undefined;
    } else if (c === '/' && texto[i + 1] === '/') {
      i = texto.indexOf('\n', i);
      if (i < 0) return undefined;
    } else if (c === '{') profundidad++;
    else if (c === '}' && --profundidad === 0) return texto.slice(abre, i);
  }
  return undefined;
}

/** Reemplaza (o agrega) `theme`, conserva su parche `{ ... }` y quita los `link`. */
export function conTema(cuerpo: string, tema: string): string {
  const sinLinks = cuerpo.replace(/(^|\s)link\s+[\w.-]+\s*->\s*[\w-]+/g, '$1');
  const cambiado = sinLinks.replace(/(^|\s)theme\s+[\w-]+/, `$1theme ${tema}`);
  return cambiado === sinLinks ? `\n  theme ${tema}${sinLinks}` : cambiado;
}

export function prepararWorkspace(origen: string, vista: string, temas: readonly string[], raizDeCache: string): WorkspacePreparado {
  const directorio = join(raizDeCache, `workspace-${basename(origen)}`);
  rmSync(directorio, { recursive: true, force: true });
  cpSync(origen, directorio, { recursive: true, filter: (ruta) => basename(ruta) !== CARPETA_DE_SALIDA });
  const cuerpo = archivosDg(directorio)
    .map((archivo) => cuerpoDeVista(readFileSync(archivo, 'utf8'), vista))
    .find((c) => c !== undefined);
  if (cuerpo === undefined) throw new Error(`La Vista '${vista}' no esta en ningun .dg de ${origen}.`);
  const vistaDe = (tema: string): string => `${vista}--${tema}`;
  const vistas = temas.map((t) => `view ${vistaDe(t)} {${conTema(cuerpo, t)}}\n`).join('\n');
  writeFileSync(join(directorio, 'capturas.dg'), `// Generado por \`pnpm capturas --workspace\`: la Vista '${vista}' con cada Tema.\n${vistas}`);
  return { directorio, vistaDe };
}
