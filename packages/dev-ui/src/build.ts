/**
 * `buildDevUi({ output, css? })`: writes in `output` the app static assets (`index.html`, `page.js` with its chunks
 * in `chunks/`, `worker.js`, `style.css`) and the export page (`export.js`, an IIFE without chunks). JS with esbuild,
 * minified and deterministic: the page is a split ES module (`splitting`), and what is imported with `import()` (the
 * editor with CodeMirror, the Finder) goes into chunks requested on demand; the Worker is an IIFE (loaded from a
 * Blob). The CSS step is pluggable (`css`): it receives the path of `browser/style.css` and returns the sheet; by
 * default esbuild bundles it.
 * Errors: an esbuild or write failure rejects.
 */
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// With its extension: `scripts/build.ts` runs this file with Node directly.
import { EXPORTED_PAGE } from './routes.ts';

const browser = (file: string): string => fileURLToPath(new URL(`../browser/${file}`, import.meta.url));

export type CssStep = (entry: string) => Promise<string>;

export interface BuildOptions {
  output: string;
  css?: CssStep;
}

const cssWithEsbuild: CssStep = async (entry) => {
  // `target` resolves nesting and adds `-webkit-backdrop-filter` (research `libreria-chrome-estudio`).
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false, minify: true, charset: 'ascii', logLevel: 'silent', target: ['chrome111', 'firefox128', 'safari16.4'] });
  return outputFiles[0]?.text ?? '';
};

/** Common JS options for the browser (the page and the Worker). */
const COMMON = {
  bundle: true,
  write: false,
  minify: true,
  platform: 'browser',
  target: 'es2020',
  charset: 'ascii',
  legalComments: 'none',
  jsx: 'automatic',
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
} as const;

/**
 * The page as an ES module with chunks: path relative to `output` -> content. Only chunks reachable from `page.js`
 * are kept: esbuild still emits a chunk for a dynamic `import()` whose caller was tree-shaken (ELK's
 * `elk.bundled.js` from `layout`, which the page never runs because layout happens in the Worker).
 */
async function bundlePage(entry: string, output: string): Promise<Record<string, Uint8Array>> {
  const { outputFiles, metafile } = await build({
    ...COMMON,
    entryPoints: { page: entry },
    format: 'esm',
    splitting: true,
    metafile: true,
    outdir: output,
    chunkNames: 'chunks/[name]-[hash]',
  });
  const reachables = new Set<string>();
  const pending = Object.keys(metafile.outputs).filter((route) => resolve(route) === resolve(output, 'page.js'));
  for (let route = pending.pop(); route !== undefined; route = pending.pop()) {
    if (reachables.has(resolve(route))) continue;
    reachables.add(resolve(route));
    pending.push(...(metafile.outputs[route]?.imports ?? []).filter((i) => !i.external).map((i) => i.path));
  }
  return Object.fromEntries(outputFiles.filter((f) => reachables.has(resolve(f.path))).map((f) => [relative(resolve(output), f.path).split(sep).join('/'), f.contents]));
}

async function bundle(entry: string, alias: Record<string, string> = {}, plugins: Plugin[] = []): Promise<string> {
  const { outputFiles } = await build({ ...COMMON, entryPoints: [entry], format: 'iife', alias, plugins });
  return outputFiles[0]?.text ?? '';
}

/** Resolves the imports whose path matches each filter to a replacement module. */
const substitute = (rules: ReadonlyArray<readonly [RegExp, string]>): Plugin => ({
  name: 'sustituir',
  setup(b) {
    for (const [filter, route] of rules) b.onResolve({ filter }, () => ({ path: route }));
  },
});

/**
 * The export page (`diagrams export`) is one IIFE, without chunks, to inline it in a single HTML. It has no editor
 * (the Code tab does not exist there) and no ELK of its own: ELK goes once, in the Worker code embedded next to it.
 */
const EXPORTED_PAGE_WITHOUT = substitute([
  [/\/editor\/code-panel$/, browser('export/without-editor.ts')],
  [/^elkjs\/lib\/elk\.bundled\.js$/, browser('export/without-elk.ts')],
]);

/**
 * The Worker carries no zod: it receives Metrics already validated in the page. `inert-zod` replaces the package so
 * the schemas, which are built on load, do not enter the bundle.
 */
export async function buildDevUi({ output, css = cssWithEsbuild }: BuildOptions): Promise<void> {
  const [page, worker, sheet, exported] = await Promise.all([
    bundlePage(browser('dev.tsx'), output),
    bundle(browser('worker/worker.ts'), { zod: browser('worker/inert-zod.ts') }),
    css(browser('style.css')),
    bundle(browser('export/page.tsx'), {}, [EXPORTED_PAGE_WITHOUT]),
  ]);
  mkdirSync(output, { recursive: true });
  // Chunks of a previous build (another hash) must not stay servable.
  rmSync(join(output, 'chunks'), { recursive: true, force: true });
  for (const [route, content] of Object.entries(page)) {
    mkdirSync(dirname(join(output, route)), { recursive: true });
    writeFileSync(join(output, route), content);
  }
  writeFileSync(join(output, 'worker.js'), worker);
  writeFileSync(join(output, EXPORTED_PAGE), exported);
  writeFileSync(join(output, 'style.css'), sheet);
  copyFileSync(browser('index.html'), join(output, 'index.html'));
}
