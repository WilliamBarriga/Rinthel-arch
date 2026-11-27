import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import { layoutView } from 'layout';
import { resolveStyle } from 'render';
import { NEUTRAL_THEME } from 'theme';
import type { ResolvedTheme } from 'theme';

import { toHtml, sheetOf } from './helpers';

const CAVEAT: ResolvedTheme = { ...NEUTRAL_THEME, fonts: { body: 'Caveat', mono: 'Press Start 2P', fallback: 'cursive' } };
const FILES = [
  'fuentes/caveat-latin-400-normal.woff2',
  'fuentes/caveat-latin-700-normal.woff2',
  'fuentes/press-start-2p-latin-400-normal.woff2',
  'fuentes/inter-latin-400-normal.woff2',
];
const url = (path: string): string => `/fonts/${path.split('/').map(encodeURIComponent).join('/')}`;

async function drawing(theme: ResolvedTheme, extra: Record<string, unknown>): Promise<string> {
  const source = canonicalFormSchema.parse({
    specification: { nodeTypes: [{ name: 'servicio' }] },
    model: { nodes: [{ id: 'a', type: 'servicio', title: 'A', description: '', children: [] }], edges: [] },
    views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
  });
  const view = resolveView(source, 'v')!;
  const geometry = await layoutView(view, theme);
  return toHtml({ view, geometry, theme, width: 400, height: 300, ...extra });
}

describe('Diagram: Workspace fonts', () => {
  it('declares a @font-face for each face of the fonts the Theme uses, with the shell URL', async () => {
    const sheet = sheetOf(await drawing(CAVEAT, { style: resolveStyle(CAVEAT, 'architecture', undefined, FILES), fontUrl: url }));

    expect(sheet).toContain('@font-face{font-family:"Caveat";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/fuentes/caveat-latin-400-normal.woff2") format("woff2")}');
    expect(sheet).toContain('font-family:"Caveat";font-style:normal;font-weight:700');
    expect(sheet).toContain('font-family:"Press Start 2P";font-style:normal;font-weight:400');
    expect(sheet).not.toContain('"Inter"');
  });

  it('the declared fallback font stays in the font-family stack', async () => {
    const sheet = sheetOf(await drawing(CAVEAT, { style: resolveStyle(CAVEAT, 'architecture', undefined, FILES), fontUrl: url }));

    expect(sheet).toContain('font-family:"Caveat", cursive');
    expect(sheet).toContain('font-family:"Press Start 2P", cursive');
  });

  it('without the shell URL there is no @font-face (export without a server), but the stack is kept', async () => {
    const sheet = sheetOf(await drawing(CAVEAT, { estilo: resolveStyle(CAVEAT, 'architecture', undefined, FILES) }));

    expect(sheet).not.toContain('@font-face');
    expect(sheet).toContain('font-family:"Caveat", cursive');
  });

  it('the URL of a file cannot escape the declaration', async () => {
    const sheet = sheetOf(await drawing(CAVEAT, { estilo: resolveStyle(CAVEAT, 'architecture', undefined, FILES), urlDeFuente: () => 'x");}</style><script>' }));

    expect(sheet).not.toContain('<script>');
    expect(sheet).not.toContain('");}');
  });
});
