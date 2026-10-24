import { describe, expect, it } from 'vitest';

import { pilaDeFuente, resolverFuentes } from 'tema';

const ARCHIVOS = [
  'fuentes/caveat-latin-400-normal.woff2',
  'fuentes/caveat-latin-700-normal.woff2',
  'fuentes/press-start-2p-latin-400-normal.woff2',
  'fuentes/inter-tight-latin-400-normal.woff2',
  'fuentes/OFL-caveat.txt',
];

describe('resolverFuentes', () => {
  it('asocia cada familia declarada con sus archivos, por peso y estilo', () => {
    const { caras, faltantes } = resolverFuentes({ body: 'Caveat', mono: 'Caveat' }, ARCHIVOS);

    expect(faltantes).toEqual([]);
    expect(caras).toEqual([
      { familia: 'Caveat', peso: 400, estilo: 'normal', ruta: 'fuentes/caveat-latin-400-normal.woff2' },
      { familia: 'Caveat', peso: 700, estilo: 'normal', ruta: 'fuentes/caveat-latin-700-normal.woff2' },
    ]);
  });

  it('una familia con espacios usa el nombre en kebab-case y no confunde familias que comparten prefijo', () => {
    expect(resolverFuentes({ body: 'Press Start 2P', mono: 'Press Start 2P' }, ARCHIVOS).caras.map((c) => c.ruta)).toEqual(['fuentes/press-start-2p-latin-400-normal.woff2']);
    expect(resolverFuentes({ body: 'Inter', mono: 'monospace' }, ARCHIVOS).faltantes).toEqual([{ clave: 'body', familia: 'Inter' }]);
  });

  it('acepta el archivo <Familia>.<ext> como peso 400', () => {
    expect(resolverFuentes({ body: 'Erica One', mono: 'monospace' }, ['x/Erica One.woff2']).caras).toEqual([{ familia: 'Erica One', peso: 400, estilo: 'normal', ruta: 'x/Erica One.woff2' }]);
  });

  it('las familias genericas y la reserva no necesitan archivo', () => {
    expect(resolverFuentes({ body: 'sans-serif', mono: 'ui-monospace', fallback: 'cursive' }, [])).toEqual({ caras: [], faltantes: [] });
  });

  it('una familia sin archivo es faltante, tambien dentro de una lista', () => {
    expect(resolverFuentes({ body: 'Georgia, serif', mono: 'monospace' }, []).faltantes).toEqual([{ clave: 'body', familia: 'Georgia' }]);
  });
});

describe('pilaDeFuente', () => {
  it('cita las familias con nombre, deja los genericos y agrega la reserva declarada', () => {
    expect(pilaDeFuente('Press Start 2P', 'monospace')).toBe('"Press Start 2P", monospace');
    expect(pilaDeFuente('Inter, sans-serif')).toBe('"Inter", sans-serif');
    expect(pilaDeFuente('monospace', 'cursive')).toBe('monospace');
  });

  it('no deja pasar comillas del Tema', () => {
    expect(pilaDeFuente('a"b')).toBe('"ab"');
  });
});
