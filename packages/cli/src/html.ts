/**
 * HTML autocontenido por Vista: un archivo con la Fuente canonica, la geometria
 * cacheada de todas las Vistas, el shell interactivo (bundle de `navegador/`),
 * las fuentes del Tema y los iconos. Sin peticiones externas.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { combineIconProviders, genericIcons, workspaceIcons } from 'canonico';
import type { Tema } from 'canonico';

import type { SalidaDeBuild } from './build';
import { fuentesDelTema } from './fuentes';
import { vistasDibujables } from './vistas-dibujables';
import type { EntradaDeExport } from './vistas-dibujables';

const ENTRADA = new URL('../navegador/entrada.tsx', import.meta.url);

let bundle: Promise<string> | undefined;

/**
 * IIFE del navegador (shell + React + layout/ELK), minificado y determinista.
 * Se calcula una vez por proceso. Se escapa `</script` y `<!--` para poder
 * ponerlo dentro de un `<script>`; solo aparecen dentro de cadenas.
 */
function bundleDelNavegador(): Promise<string> {
  bundle ??= build({
    entryPoints: [fileURLToPath(ENTRADA)],
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
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then(({ outputFiles }) => {
    const codigo = outputFiles[0]?.text ?? '';
    return codigo.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  });
  return bundle;
}

/** JSON seguro dentro de `<script type="application/json">`. */
const jsonEnHtml = (valor: unknown): string =>
  JSON.stringify(valor).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const escaparHtml = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `@font-face` con data URI para las fuentes de los Temas en uso. */
function estiloDeFuentes(temas: readonly Tema[], fuentes: Readonly<Record<string, string>>): string {
  const vistas = new Set<string>();
  const reglas: string[] = [];
  for (const { family, mime, data } of temas.flatMap((tema) => fuentesDelTema(tema, fuentes))) {
    if (vistas.has(family)) continue;
    vistas.add(family);
    reglas.push(`@font-face{font-family:'${family.replace(/['\\]/g, '\\$&')}';src:url(data:${mime};base64,${data})}`);
  }
  return reglas.join('\n');
}

/** Un HTML por Vista (`html/<vista>.html`) a partir de la salida de `build`. Lanza si a una Vista le falta la geometria o esta obsoleta. */
export async function exportarHtml(entrada: EntradaDeExport): Promise<SalidaDeBuild> {
  const { fuente, workspace, fuentes } = entrada;
  const porVista = Object.fromEntries(
    vistasDibujables(entrada).map(({ id, theme, geometry }) => [id, { theme: theme.name, geometry }]),
  );
  const usados = fuente.themes.filter(({ name }) => Object.values(porVista).some(({ theme }) => theme === name));
  const proveedor = combineIconProviders(workspaceIcons(workspace), genericIcons());
  const iconos = Object.fromEntries(
    proveedor.keys().sort().flatMap((clave) => {
      const svg = proveedor.resolve(clave);
      return svg === undefined ? [] : [[clave, svg] as const];
    }),
  );
  const codigo = await bundleDelNavegador();
  const estilo = estiloDeFuentes(usados, fuentes);

  return Object.fromEntries(
    fuente.views.map(({ id }) => {
      const datos = jsonEnHtml({ fuente, vista: id, geometrias: porVista, iconos });
      const html = [
        '<!doctype html>',
        '<html lang="es">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        `<title>${escaparHtml(id)}</title>`,
        `<style>html,body,#raiz{margin:0;height:100%;overflow:hidden}${estilo === '' ? '' : `\n${estilo}\n`}</style>`,
        '</head>',
        '<body>',
        '<div id="raiz"></div>',
        `<script id="datos" type="application/json">${datos}</script>`,
        `<script id="app">${codigo}</script>`,
        '</body>',
        '</html>',
        '',
      ].join('\n');
      return [`html/${id}.html`, html];
    }),
  );
}
