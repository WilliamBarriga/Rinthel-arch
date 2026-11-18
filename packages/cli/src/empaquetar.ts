import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** IIFE minificado y determinista. Escapa `</script` y `<!--` (solo aparecen en cadenas) para ir dentro de un `<script>`. */
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
