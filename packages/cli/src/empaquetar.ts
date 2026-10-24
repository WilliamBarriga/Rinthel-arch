/** Empaquetado con esbuild de los bundles del navegador que sirve `dev`. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * IIFE minificado y determinista. Se escapa `</script` y `<!--` para poder
 * ponerlo dentro de un `<script>`; solo aparecen dentro de cadenas.
 */
export async function empaquetar(entrada: URL, alias: Record<string, string> = {}): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(entrada)],
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
  return (outputFiles[0]?.text ?? '').replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}
