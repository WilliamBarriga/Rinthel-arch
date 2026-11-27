/**
 * `exportHtml(data, { title, statics })`: the single self-contained HTML of `diagrams export`. Inlines the
 * stylesheet, the export page (`export.js`), the layout Worker code (text started from a Blob) and the data (JSON).
 * Invariants: no `src`, `href` or `@import` towards other files (the empty `data:` icon spares the `/favicon.ico`
 * request); nothing inline can close its element early (`</` and `<!--` are escaped in scripts and styles, `<` in the
 * JSON). Errors: throws if the `dev-ui` build is missing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExportData } from './export';
import { DATA_ID, WORKER_ID, EXPORTED_PAGE } from './routes';

export interface HtmlOptions {
  /** `<title>` of the page. */
  title: string;
  /** Folder of the `dev-ui` build (`dist/dev-ui/`). */
  statics: string;
}

/** Text inside `<script>` or `<style>`: `</` would end the element (`<\/` means the same in JS strings and CSS). */
const inElement = (text: string): string => text.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function exportHtml(data: ExportData, { title, statics }: HtmlOptions): string {
  const read = (file: string): string => {
    try {
      return readFileSync(join(statics, file), 'utf8');
    } catch {
      throw new Error(`Missing '${file}' of the Dev UI build (pnpm --filter dev-ui build)`);
    }
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
<style>${inElement(read('style.css'))}</style>
</head>
<body>
<div id="raiz"></div>
<script type="application/json" id="${DATA_ID}">${json}</script>
<script type="text/plain" id="${WORKER_ID}">${inElement(read('worker.js'))}</script>
<script>${inElement(read(EXPORTED_PAGE))}</script>
</body>
</html>
`;
}
