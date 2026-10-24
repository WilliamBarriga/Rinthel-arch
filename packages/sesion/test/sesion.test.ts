import { describe, expect, it } from 'vitest';

import { abrirSesion, archivoDeVista } from 'sesion';

describe('archivoDeVista', () => {
  it('devuelve el archivo en que se declara la Vista', () => {
    const sesion = abrirSesion({
      'a.dg': 'specification { node servicio }\nmodel { servicio x }\n',
      'b.dg': 'view v {\n  type architecture\n  include **\n}\n',
    });
    expect(archivoDeVista(sesion, 'v')).toBe('b.dg');
  });

  it('es undefined para una Vista inexistente o una Sesion con errores', () => {
    const valida = abrirSesion({ 'main.dg': 'specification { node servicio }\nmodel { servicio a }\nview v { type architecture include ** }\n' });
    expect(archivoDeVista(valida, 'nada')).toBeUndefined();
    expect(archivoDeVista(abrirSesion({ 'main.dg': 'model {' }), 'v')).toBeUndefined();
  });
});

const base = (extra = '') => `specification { node servicio }
model { servicio a  servicio b  servicio c }
view v {
  type architecture
  include **
${extra}}
view w {
  type architecture
  include a
}
`;

const conPinsSolapados = base('  node a { pin 0,0 }\n  node b { pin 10,10 }\n');

describe('Sesion', () => {
  it('diagnosticar devuelve los issues de compilacion de un Workspace en memoria', async () => {
    const sesion = abrirSesion({ 'main.dg': 'specification { node servicio }\nmodel {\n  servicio api {' });

    const issues = await sesion.diagnosticar();

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === 'error' && i.file === 'main.dg')).toBe(true);
    expect(sesion.fuente).toBeUndefined();
  });

  it('un Workspace valido sin Pins no tiene issues y no calcula layout', async () => {
    const sesion = abrirSesion({ 'main.dg': base() });

    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.fuente?.views.map((v) => v.id)).toEqual(['v', 'w']);
    expect(sesion.vistasConGeometria()).toEqual([]);
  });

  it('diagnosticar emite W_OVERLAPPING_PINS con posicion y solo paga layout en Vistas con 2 o mas Pins', async () => {
    const sesion = abrirSesion({ 'main.dg': conPinsSolapados });

    const issues = await sesion.diagnosticar();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'W_OVERLAPPING_PINS', severity: 'warning', file: 'main.dg' });
    expect(issues[0]?.related).toHaveLength(1);
    expect(sesion.vistasConGeometria()).toEqual(['v']);
  });

  it('geometria es perezosa, memoizada por Vista y cacheable (view, theme, layoutKey)', async () => {
    const sesion = abrirSesion({ 'main.dg': base() });

    const primera = await sesion.geometria('w');
    const segunda = await sesion.geometria('w');

    expect(primera).toBe(segunda);
    expect(primera).toMatchObject({ view: 'w', theme: 'neutral' });
    expect(Object.keys(primera?.geometry.nodes ?? {})).toEqual(['a']);
    expect(sesion.vistasConGeometria()).toEqual(['w']);
    expect(await sesion.geometria('no-existe')).toBeUndefined();
  });

  it('construir devuelve canonico.json, una geometria por Vista y los avisos', async () => {
    const sesion = abrirSesion({ 'main.dg': conPinsSolapados });

    const { archivos, issues } = await sesion.construir();

    expect(Object.keys(archivos).sort()).toEqual(['canonico.json', 'geometria/v.json', 'geometria/w.json']);
    expect(JSON.parse(archivos['geometria/v.json']!)).toMatchObject({ view: 'v', theme: 'neutral' });
    expect(issues.map((i) => i.code)).toEqual(['W_OVERLAPPING_PINS']);
  });

  it('construir con errores no produce archivos', async () => {
    const sesion = abrirSesion({ 'main.dg': 'model {' });

    const { archivos, issues } = await sesion.construir();

    expect(archivos).toEqual({});
    expect(issues.length).toBeGreaterThan(0);
  });

  it('el tema de la opcion se usa salvo que la Vista declare el suyo', async () => {
    const fuente = `specification { node servicio }
theme claro extends neutral { palette { acento "#0ea5e9" } }
model { servicio a }
view v { type architecture  include * }
view w { type architecture  include *  theme neutral }
`;
    const sesion = abrirSesion({ 'main.dg': fuente }, { tema: 'claro' });

    expect((await sesion.geometria('v'))?.theme).toBe('claro');
    expect((await sesion.geometria('w'))?.theme).toBe('neutral');
  });

  it('actualizar devuelve otra Sesion sin mutar la anterior', async () => {
    const antes = abrirSesion({ 'main.dg': base() });
    await antes.geometria('w');

    const despues = antes.actualizar({ 'main.dg': 'model {' });

    expect(despues).not.toBe(antes);
    expect(antes.fuente).toBeDefined();
    expect(despues.fuente).toBeUndefined();
    expect(await antes.diagnosticar()).toEqual([]);
  });

  it('actualizar reutiliza la geometria si la layoutKey no cambia y la recalcula si cambia', async () => {
    const antes = abrirSesion({ 'main.dg': base() });
    const geoW = await antes.geometria('w');
    const geoV = await antes.geometria('v');

    const despues = antes.actualizar({ 'main.dg': base().replace('include **', 'include a, b') });

    expect(await despues.geometria('w')).toBe(geoW);
    expect(await despues.geometria('v')).not.toBe(geoV);
    expect(Object.keys((await despues.geometria('v'))?.geometry.nodes ?? {}).sort()).toEqual(['a', 'b']);
  });

  it('actualizar recalcula si cambian los Pins aunque la layoutKey sea la misma', async () => {
    const antes = abrirSesion({ 'main.dg': base('  node a { pin 0,0 }\n') });
    const geo = await antes.geometria('v');

    const despues = antes.actualizar({ 'main.dg': base('  node a { pin 300,300 }\n') });
    const nueva = await despues.geometria('v');

    expect(nueva).not.toBe(geo);
    // El Pin fija el centro: la tarjeta del neutro mide 160 x 54.
    expect(nueva?.geometry.nodes['a']).toMatchObject({ x: 220, y: 273, width: 160, height: 54 });
  });
});
