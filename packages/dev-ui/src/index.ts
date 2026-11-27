/**
 * `dev-ui`: the browser app of `dev` (ADR 0004, `dev-ui` amendment). This is the Node entry, minimal:
 * `devUiAssets()` gives the disk paths of the static assets the build produces (`dist/dev-ui/`), and `DEV_UI_ROUTE`
 * the prefix under which `cli` serves them. The protocol contract is in `dev-ui/protocol`.
 * Export (`diagrams export`): `captureExport` (the data, through the `dev` API) and `exportHtml` (the file).
 * Invariants: it bundles nothing; it only lists the page chunks (`chunks/`, hashed) on every call; the paths exist
 * only after `pnpm --filter dev-ui build`.
 * Depends on `canonical`, `layout`, `render`, `session` (only `inMemoryDev` of `dev-ui/contract`) and `shell` (only the
 * browser app, which is not exported here).
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEV_UI_FILES, CHUNKS_FOLDER } from './routes';

export { DEV_UI_ROUTE } from './routes';
export { captureExport, exportDataSchema, EXPORT_FORMAT } from './export';
export type { ExportData, CaptureSources, ReadSource } from './export';
export { exportHtml } from './export-html';
export type { HtmlOptions } from './export-html';

export interface DevUiAssets {
  /** HTML of the page, which `dev` serves at `/`. */
  index: string;
  /** Public name under `/_dev-ui/` -> absolute path on disk. Only these are served. */
  files: Readonly<Record<string, string>>;
}

/** `../dist/dev-ui/` works the same from `src/index.ts` (tests) and from `dist/index.js` (build). */
const FOLDER = new URL('../dist/dev-ui/', import.meta.url);

/** The build folder (`dist/dev-ui/`): `exportHtml` reads the export page, the Worker and the CSS from it. */
export const devUiFolder = (): string => fileURLToPath(FOLDER);

/** Lists the page chunks on every call: a rebuild changes their names (they are hashed). */
export function devUiAssets(): DevUiAssets {
  const chunksFolder = new URL(`${CHUNKS_FOLDER}/`, FOLDER);
  const chunks = existsSync(chunksFolder) ? readdirSync(chunksFolder).map((t) => `${CHUNKS_FOLDER}/${t}`) : [];
  return {
    index: fileURLToPath(new URL('index.html', FOLDER)),
    files: Object.fromEntries([...DEV_UI_FILES, ...chunks].map((name) => [name, fileURLToPath(new URL(name, FOLDER))])),
  };
}
