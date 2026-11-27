import { describe, expect, it } from 'vitest';

import { fontStack, resolveFonts } from 'theme';

const FILES = [
  'fuentes/caveat-latin-400-normal.woff2',
  'fuentes/caveat-latin-700-normal.woff2',
  'fuentes/press-start-2p-latin-400-normal.woff2',
  'fuentes/inter-tight-latin-400-normal.woff2',
  'fuentes/OFL-caveat.txt',
];

describe('resolveFonts', () => {
  it('matches each declared family with its files, by weight and style', () => {
    const { caras: faces, faltantes: missing } = resolveFonts({ body: 'Caveat', mono: 'Caveat' }, FILES);

    expect(missing).toEqual([]);
    expect(faces).toEqual([
      { familia: 'Caveat', peso: 400, estilo: 'normal', ruta: 'fuentes/caveat-latin-400-normal.woff2' },
      { familia: 'Caveat', peso: 700, estilo: 'normal', ruta: 'fuentes/caveat-latin-700-normal.woff2' },
    ]);
  });

  it('a family with spaces uses the kebab-case name and does not mix up families that share a prefix', () => {
    expect(resolveFonts({ body: 'Press Start 2P', mono: 'Press Start 2P' }, FILES).caras.map((c) => c.ruta)).toEqual(['fuentes/press-start-2p-latin-400-normal.woff2']);
    expect(resolveFonts({ body: 'Inter', mono: 'monospace' }, FILES).faltantes).toEqual([{ clave: 'body', familia: 'Inter' }]);
  });

  it('accepts the <Family>.<ext> file as weight 400', () => {
    expect(resolveFonts({ body: 'Erica One', mono: 'monospace' }, ['x/Erica One.woff2']).caras).toEqual([{ familia: 'Erica One', peso: 400, estilo: 'normal', ruta: 'x/Erica One.woff2' }]);
  });

  it('generic families and the fallback need no file', () => {
    expect(resolveFonts({ body: 'sans-serif', mono: 'ui-monospace', fallback: 'cursive' }, [])).toEqual({ caras: [], faltantes: [] });
  });

  it('a family without a file is missing, also inside a list', () => {
    expect(resolveFonts({ body: 'Georgia, serif', mono: 'monospace' }, []).faltantes).toEqual([{ clave: 'body', familia: 'Georgia' }]);
  });
});

describe('fontStack', () => {
  it('quotes named families, keeps the generics and appends the declared fallback', () => {
    expect(fontStack('Press Start 2P', 'monospace')).toBe('"Press Start 2P", monospace');
    expect(fontStack('Inter, sans-serif')).toBe('"Inter", sans-serif');
    expect(fontStack('monospace', 'cursive')).toBe('monospace');
  });

  it('does not let quotes from the Theme through', () => {
    expect(fontStack('a"b')).toBe('"ab"');
  });
});
