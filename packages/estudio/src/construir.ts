/**
 * `construirEstudio({ salida, css? })`: escribe en `salida` los estaticos de la app (`index.html`, `pagina.js` con sus
 * trozos en `trozos/`, `worker.js`, `estilo.css`). JS con esbuild, minificado y determinista: la pagina es un modulo ES
 * partido (`splitting`), y lo que se importa con `import()` (el editor con CodeMirror, el Buscador) va en trozos que se
 * piden bajo demanda; el Worker es un IIFE (se carga por Blob). El paso de CSS es
 * conectable (`css`): recibe la ruta de `navegador/estilo.css` y devuelve la hoja; por defecto la empaqueta esbuild.
 * Errores: un fallo de esbuild o de escritura rechaza.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const navegador = (archivo: string): string => fileURLToPath(new URL(`../navegador/${archivo}`, import.meta.url));

export type PasoDeCss = (entrada: string) => Promise<string>;

export interface OpcionesDeConstruccion {
  salida: string;
  css?: PasoDeCss;
}

const cssConEsbuild: PasoDeCss = async (entrada) => {
  // `target` resuelve el anidado y anade `-webkit-backdrop-filter` (research `libreria-chrome-estudio`).
  const { outputFiles } = await build({ entryPoints: [entrada], bundle: true, write: false, minify: true, charset: 'ascii', logLevel: 'silent', target: ['chrome111', 'firefox128', 'safari16.4'] });
  return outputFiles[0]?.text ?? '';
};

/** Opciones comunes de JS para navegador (la pagina y el Worker). */
const COMUNES = {
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
 * La pagina como modulo ES con trozos: ruta relativa a `salida` -> contenido. Only chunks reachable from `pagina.js`
 * are kept: esbuild still emits a chunk for a dynamic `import()` whose caller was tree-shaken (ELK's
 * `elk.bundled.js` from `layout`, which the page never runs because layout happens in the Worker).
 */
async function empaquetarPagina(entrada: string, salida: string): Promise<Record<string, Uint8Array>> {
  const { outputFiles, metafile } = await build({
    ...COMUNES,
    entryPoints: { pagina: entrada },
    format: 'esm',
    splitting: true,
    metafile: true,
    outdir: salida,
    chunkNames: 'trozos/[name]-[hash]',
  });
  const alcanzables = new Set<string>();
  const pendientes = Object.keys(metafile.outputs).filter((ruta) => resolve(ruta) === resolve(salida, 'pagina.js'));
  for (let ruta = pendientes.pop(); ruta !== undefined; ruta = pendientes.pop()) {
    if (alcanzables.has(resolve(ruta))) continue;
    alcanzables.add(resolve(ruta));
    pendientes.push(...(metafile.outputs[ruta]?.imports ?? []).filter((i) => !i.external).map((i) => i.path));
  }
  return Object.fromEntries(outputFiles.filter((f) => alcanzables.has(resolve(f.path))).map((f) => [relative(resolve(salida), f.path).split(sep).join('/'), f.contents]));
}

async function empaquetar(entrada: string, alias: Record<string, string> = {}): Promise<string> {
  const { outputFiles } = await build({ ...COMUNES, entryPoints: [entrada], format: 'iife', alias });
  return outputFiles[0]?.text ?? '';
}

/**
 * El Worker no lleva zod: recibe Metricas ya validadas en la pagina. `zod-inerte` sustituye al paquete para que
 * los esquemas, que se construyen al cargar, no entren al bundle.
 */
export async function construirEstudio({ salida, css = cssConEsbuild }: OpcionesDeConstruccion): Promise<void> {
  const [pagina, worker, hoja] = await Promise.all([
    empaquetarPagina(navegador('dev.tsx'), salida),
    empaquetar(navegador('worker/worker.ts'), { zod: navegador('worker/zod-inerte.ts') }),
    css(navegador('estilo.css')),
  ]);
  mkdirSync(salida, { recursive: true });
  // Trozos de un build anterior (otro hash) no deben quedar servibles.
  rmSync(join(salida, 'trozos'), { recursive: true, force: true });
  for (const [ruta, contenido] of Object.entries(pagina)) {
    mkdirSync(dirname(join(salida, ruta)), { recursive: true });
    writeFileSync(join(salida, ruta), contenido);
  }
  writeFileSync(join(salida, 'worker.js'), worker);
  writeFileSync(join(salida, 'estilo.css'), hoja);
  copyFileSync(navegador('index.html'), join(salida, 'index.html'));
}
