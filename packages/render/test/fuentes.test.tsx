import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import { layoutView } from 'layout';
import { resolverEstilo } from 'render';
import { TEMA_NEUTRO } from 'tema';
import type { TemaResuelto } from 'tema';

import { aHtml, hojaDe } from './ayudas';

const CAVEAT: TemaResuelto = { ...TEMA_NEUTRO, fonts: { body: 'Caveat', mono: 'Press Start 2P', fallback: 'cursive' } };
const ARCHIVOS = [
  'fuentes/caveat-latin-400-normal.woff2',
  'fuentes/caveat-latin-700-normal.woff2',
  'fuentes/press-start-2p-latin-400-normal.woff2',
  'fuentes/inter-latin-400-normal.woff2',
];
const url = (ruta: string): string => `/fuentes/${ruta.split('/').map(encodeURIComponent).join('/')}`;

async function dibujo(tema: TemaResuelto, extra: Record<string, unknown>): Promise<string> {
  const fuente = fuenteCanonicaSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [{ id: 'a', type: 'servicio', title: 'A', description: '', children: [] }], edges: [] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(fuente, 'v')!;
  const geometry = await layoutView(view, tema);
  return aHtml({ view, geometry, theme: tema, width: 400, height: 300, ...extra });
}

describe('Diagram: fuentes del Workspace', () => {
  it('declara un @font-face por cada cara de las fuentes que usa el Tema, con la URL del shell', async () => {
    const hoja = hojaDe(await dibujo(CAVEAT, { estilo: resolverEstilo(CAVEAT, undefined, ARCHIVOS), urlDeFuente: url }));

    expect(hoja).toContain('@font-face{font-family:"Caveat";font-style:normal;font-weight:400;font-display:block;src:url("/fuentes/fuentes/caveat-latin-400-normal.woff2") format("woff2")}');
    expect(hoja).toContain('font-family:"Caveat";font-style:normal;font-weight:700');
    expect(hoja).toContain('font-family:"Press Start 2P";font-style:normal;font-weight:400');
    expect(hoja).not.toContain('"Inter"');
  });

  it('la fuente de reserva declarada queda en la pila de font-family', async () => {
    const hoja = hojaDe(await dibujo(CAVEAT, { estilo: resolverEstilo(CAVEAT, undefined, ARCHIVOS), urlDeFuente: url }));

    expect(hoja).toContain('font-family:"Caveat", cursive');
    expect(hoja).toContain('font-family:"Press Start 2P", cursive');
  });

  it('sin URL del shell no hay @font-face (export sin servidor), pero la pila se conserva', async () => {
    const hoja = hojaDe(await dibujo(CAVEAT, { estilo: resolverEstilo(CAVEAT, undefined, ARCHIVOS) }));

    expect(hoja).not.toContain('@font-face');
    expect(hoja).toContain('font-family:"Caveat", cursive');
  });

  it('la URL de un archivo no puede salirse de la declaracion', async () => {
    const hoja = hojaDe(await dibujo(CAVEAT, { estilo: resolverEstilo(CAVEAT, undefined, ARCHIVOS), urlDeFuente: () => 'x");}</style><script>' }));

    expect(hoja).not.toContain('<script>');
    expect(hoja).not.toContain('");}');
  });
});
