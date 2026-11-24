/**
 * `htmlDeExportado(datos, { titulo, estaticos })`: the single self-contained HTML of `diagrams export`. Inlines the
 * stylesheet, the export page (`exportado.js`), the layout Worker code (text started from a Blob) and the data (JSON).
 * Invariants: no `src`, `href` or `@import` towards other files (the empty `data:` icon spares the `/favicon.ico`
 * request); nothing inline can close its element early (`</` and `<!--` are escaped in scripts and styles, `<` in the
 * JSON). Errors: throws if the `estudio` build is missing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DatosDeExportado } from './exportado';
import { ID_DE_LOS_DATOS, ID_DEL_WORKER, PAGINA_EXPORTADA } from './rutas';

export interface OpcionesDelHtml {
  /** `<title>` of the page. */
  titulo: string;
  /** Folder of the `estudio` build (`dist/estudio/`). */
  estaticos: string;
}

/** Text inside `<script>` or `<style>`: `</` would end the element (`<\/` means the same in JS strings and CSS). */
const enElemento = (texto: string): string => texto.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

const escaparHtml = (texto: string): string => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function htmlDeExportado(datos: DatosDeExportado, { titulo, estaticos }: OpcionesDelHtml): string {
  const leer = (archivo: string): string => {
    try {
      return readFileSync(join(estaticos, archivo), 'utf8');
    } catch {
      throw new Error(`Missing '${archivo}' of the Dev UI build (pnpm --filter estudio build)`);
    }
  };
  const json = JSON.stringify(datos).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<link rel="icon" href="data:,">
<style>${enElemento(leer('estilo.css'))}</style>
</head>
<body>
<div id="raiz"></div>
<script type="application/json" id="${ID_DE_LOS_DATOS}">${json}</script>
<script type="text/plain" id="${ID_DEL_WORKER}">${enElemento(leer('worker.js'))}</script>
<script>${enElemento(leer(PAGINA_EXPORTADA))}</script>
</body>
</html>
`;
}
