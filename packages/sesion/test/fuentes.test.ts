import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo } }
model {
  servicio api
  servicio db
  api -> db
}
`;

const vista = `view v {
  type architecture
  include **
  theme t
}
`;

const tema = (fonts: string) => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8" }
  ${fonts}
  node {
    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    slots { title attrs }
  }
}
`;

const trabajo = (fonts: string) => ({ 'main.dg': modelo + tema(fonts) + vista });
const CAVEAT = ['fuentes/caveat-latin-400-normal.woff2', 'fuentes/caveat-latin-700-normal.woff2', 'fuentes/OFL-caveat.txt'];
const CON_CAVEAT = 'fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }';

describe('seam sesion: fuentes del Workspace', () => {
  it('una fuente declarada sin archivo es un error con codigo y posicion en el Tema, y sugiere la cercana', async () => {
    const sesion = abrirSesion(trabajo('fonts { body "Cavet"  mono "monospace"  fallback "sans-serif" }'), { archivosDeFuente: CAVEAT });

    const errores = (await sesion.diagnosticar()).filter((x) => x.severity === 'error');
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ code: 'E_THEME_FONT_MISSING', file: 'main.dg', line: 7, column: 7 });
    expect(errores[0]!.message).toContain("'Cavet'");
    expect(errores[0]!.message).toContain('fonts.body');
    expect(errores[0]!.hint).toContain("'caveat'");
  });

  it('el error tambien sale de construir', async () => {
    const { issues } = await abrirSesion(trabajo('fonts { body "Caveat"  mono "monospace"  fallback "sans-serif" }'), { archivosDeFuente: [] }).construir();

    expect(issues.map((x) => x.code)).toContain('E_THEME_FONT_MISSING');
  });

  it('con el archivo en el Workspace no hay error y el Estilo resuelto trae las caras y la reserva declarada', async () => {
    const sesion = abrirSesion(trabajo(CON_CAVEAT), { archivosDeFuente: CAVEAT });

    expect((await sesion.diagnosticar()).filter((x) => x.severity === 'error')).toEqual([]);
    const { fuentes } = sesion.estilo('v')!;
    expect(fuentes.cuerpo).toBe('"Caveat", cursive');
    expect(fuentes.caras.map((c) => [c.peso, c.ruta])).toEqual([
      [400, 'fuentes/caveat-latin-400-normal.woff2'],
      [700, 'fuentes/caveat-latin-700-normal.woff2'],
    ]);
  });

  it('las familias genericas no piden archivo', async () => {
    const sesion = abrirSesion(trabajo('fonts { body "sans-serif"  mono "ui-monospace" }'), { archivosDeFuente: [] });

    expect((await sesion.diagnosticar()).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('sin la lista de archivos (adaptador que no la conoce) no se comprueba', async () => {
    const sesion = abrirSesion(trabajo(CON_CAVEAT));

    expect((await sesion.diagnosticar()).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('actualizar conserva la lista de archivos y acepta una nueva', async () => {
    const sin = abrirSesion(trabajo(CON_CAVEAT), { archivosDeFuente: [] });
    const con = sin.actualizar(trabajo(CON_CAVEAT), { archivosDeFuente: CAVEAT });

    expect((await sin.diagnosticar()).map((x) => x.code)).toContain('E_THEME_FONT_MISSING');
    expect((await con.diagnosticar()).map((x) => x.code)).not.toContain('E_THEME_FONT_MISSING');
    expect((await sin.actualizar(trabajo(CON_CAVEAT)).diagnosticar()).map((x) => x.code)).toContain('E_THEME_FONT_MISSING');
  });
});
