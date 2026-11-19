/**
 * `construirEstudio({ salida, css? })`: escribe en `salida` los estaticos de la app (`index.html`, `pagina.js`,
 * `worker.js`, `estilo.css`). JS con esbuild: IIFE minificado, determinista, para navegador. El paso de CSS es
 * conectable (`css`): recibe la ruta de `navegador/estilo.css` y devuelve la hoja; por defecto la empaqueta esbuild.
 * Errores: un fallo de esbuild o de escritura rechaza.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

async function empaquetar(entrada: string, alias: Record<string, string> = {}): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [entrada],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    charset: 'ascii',
    legalComments: 'none',
    jsx: 'automatic',
    logLevel: 'silent',
    alias,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return outputFiles[0]?.text ?? '';
}

/**
 * El Worker no lleva zod: recibe Metricas ya validadas en la pagina. `zod-inerte` sustituye al paquete para que
 * los esquemas, que se construyen al cargar, no entren al bundle.
 */
export async function construirEstudio({ salida, css = cssConEsbuild }: OpcionesDeConstruccion): Promise<void> {
  const [pagina, worker, hoja] = await Promise.all([
    empaquetar(navegador('dev.tsx')),
    empaquetar(navegador('worker.ts'), { zod: navegador('zod-inerte.ts') }),
    css(navegador('estilo.css')),
  ]);
  mkdirSync(salida, { recursive: true });
  writeFileSync(join(salida, 'pagina.js'), pagina);
  writeFileSync(join(salida, 'worker.js'), worker);
  writeFileSync(join(salida, 'estilo.css'), hoja);
  copyFileSync(navegador('index.html'), join(salida, 'index.html'));
}
