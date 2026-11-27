/** Prefix under which `dev` serves the Dev UI static assets; the HTML of `browser/index.html` repeats it. */
export const DEV_UI_ROUTE = '/_dev-ui/';

/** Static assets the build produces in `dist/dev-ui/`, besides `index.html` (served at `/`). */
export const DEV_UI_FILES = ['page.js', 'worker.js', 'style.css'] as const;

/** Folder of `dist/dev-ui/` with the page chunks loaded on demand (hashed names). */
export const CHUNKS_FOLDER = 'chunks';

/** Page of an exported Dev UI (`diagrams export`), an IIFE in `dist/dev-ui/`; `dev` does not serve it. */
export const EXPORTED_PAGE = 'export.js';

/** Ids of the elements of an exported HTML that carry the data (JSON) and the layout Worker code (text). */
export const DATA_ID = 'rinthel-datos';
export const WORKER_ID = 'rinthel-worker';
