import { describe, expect, it } from 'vitest';

import { abrirSesion, aplicarAlWorkspace, hashDeContenido, workspaceEnMemoria } from 'sesion';
import type { Intencion, PuertoDeWorkspace } from 'sesion';

const texto = `specification { node servicio }
model { servicio a }
view v {
  type architecture
  include **
}
`;

/** El adaptador en memoria de `sesion`, anotando cada escritura. */
function fake(propios: Record<string, string>, temas: Record<string, string> = {}) {
  const ws = workspaceEnMemoria({ propios, temas });
  const escrituras: string[] = [];
  const puerto: PuertoDeWorkspace = {
    leer: () => ws.leer(),
    escribir: (ruta, nuevo) => {
      escrituras.push(ruta);
      ws.escribir(ruta, nuevo);
    },
  };
  return { puerto, escrituras, texto: (ruta: string) => ws.texto(ruta) };
}

const mover = (_t: string, extra: Partial<Extract<Intencion, { tipo: 'mover-pin' }>> = {}): Intencion => ({
  tipo: 'mover-pin',
  vista: 'v',
  nodo: 'a',
  x: 4,
  y: 6,
  ...extra,
});

describe('Workspace en memoria', () => {
  it('lo que escribe la puerta lo ve la Sesion abierta sobre el; los Temas solo se leen y un archivo borrado desaparece', async () => {
    const ws = workspaceEnMemoria({ propios: { 'main.dg': texto, 'nota.dg': '// nota\n' }, temas: { 'tema.dg': 'theme t {}\n' } });

    expect(aplicarAlWorkspace(ws, mover(texto)).ok).toBe(true);
    ws.borrar('nota.dg');

    const { disco, propios } = ws.leer();
    expect(Object.keys(disco).sort()).toEqual(['main.dg', 'tema.dg']);
    expect(Object.keys(propios)).toEqual(['main.dg']);
    const sesion = abrirSesion(disco);
    expect(sesion.fuente?.views[0]?.overrides).toEqual([expect.objectContaining({ node: 'a', pin: { x: 4, y: 6 } })]);
    expect(ws.texto('nota.dg')).toBeUndefined();
  });
});

describe('aplicarAlWorkspace', () => {
  it('escribe solo los archivos cambiados y los informa', () => {
    const ws = fake({ 'main.dg': texto, 'otro.dg': '' });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto));
    expect(r).toMatchObject({ ok: true, cambiados: ['main.dg'], ediciones: [{ file: 'main.dg', replacement: expect.stringContaining('pin 4,6') }] });
    expect(ws.escrituras).toEqual(['main.dg']);
    expect(ws.texto('main.dg')).toContain('node a { pin 4,6 }');
  });

  it('rechaza con motivo y no escribe nada', () => {
    const ws = fake({ 'main.dg': texto });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto), { 'main.dg': 'viejo' });
    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'main.dg' });
    expect(ws.escrituras).toEqual([]);
  });

  it('un visto desactualizado de otro archivo no impide la edicion; sin visto aplica sobre el vigente', () => {
    const ws = fake({ 'main.dg': texto, 'otro.dg': '' });
    expect(aplicarAlWorkspace(ws.puerto, mover(texto), { 'otro.dg': 'viejo', 'main.dg': hashDeContenido(texto) })).toMatchObject({ ok: true, cambiados: ['main.dg'] });
    expect(aplicarAlWorkspace(ws.puerto, mover(texto, { x: 9 }))).toMatchObject({ ok: true });
  });

  it('no escribe un archivo que no es del Workspace (viene de un tema)', () => {
    const ws = fake({}, { 'main.dg': texto });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto));
    expect(r).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'main.dg' });
    expect(ws.escrituras).toEqual([]);
  });

  it('escribe una lista de ediciones estructuradas todo o nada', () => {
    const ws = fake({ 'main.dg': texto, 'otro.dg': 'x' });
    const punto = { line: 2, column: 19 };
    const edicion = { file: 'main.dg', range: { start: punto, end: punto }, replacement: '  servicio b', hash: hashDeContenido(texto) };
    const r = aplicarAlWorkspace(ws.puerto, [edicion]);
    expect(r).toMatchObject({ ok: true, cambiados: ['main.dg'], ediciones: [edicion] });
    expect(ws.texto('main.dg')).toContain('servicio a  servicio b }');

    const vieja = aplicarAlWorkspace(ws.puerto, [{ file: 'otro.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n', hash: hashDeContenido('x') }, edicion]);
    expect(vieja).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'main.dg' });
    expect(ws.escrituras).toEqual(['main.dg']);
  });

  it('una edicion estructurada sobre un archivo de un tema se rechaza sin escribir', () => {
    const ws = fake({ 'main.dg': texto }, { 'tema.dg': 'theme t {}\n' });
    const punto = { line: 1, column: 1 };
    const r = aplicarAlWorkspace(ws.puerto, [{ file: 'tema.dg', range: { start: punto, end: punto }, replacement: '\n', hash: hashDeContenido('theme t {}\n') }]);
    expect(r).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'tema.dg' });
    expect(ws.escrituras).toEqual([]);
  });
});

describe('ediciones de texto del editor (sin hash, con visto)', () => {
  const punto = { line: 2, column: 19 };
  const agregarB = { file: 'main.dg', range: { start: punto, end: punto }, replacement: '  servicio b' };

  it('sin hash propio, la concurrencia la decide visto: el hash que vio quien edita', () => {
    const ws = fake({ 'main.dg': texto });
    expect(aplicarAlWorkspace(ws.puerto, [agregarB], { 'main.dg': 'viejo' })).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'main.dg' });
    expect(ws.escrituras).toEqual([]);
    expect(aplicarAlWorkspace(ws.puerto, [agregarB], { 'main.dg': hashDeContenido(texto) })).toMatchObject({ ok: true, cambiados: ['main.dg'] });
    expect(ws.texto('main.dg')).toContain('servicio a  servicio b }');
  });

  it('sin hash ni visto del archivo, se aplica sobre el texto vigente', () => {
    const ws = fake({ 'main.dg': texto });
    expect(aplicarAlWorkspace(ws.puerto, [agregarB])).toMatchObject({ ok: true, cambiados: ['main.dg'] });
  });

  it('por defecto rechaza un texto que introduce un error; con aunqueNoCompile lo escribe igual', () => {
    const ws = fake({ 'main.dg': texto });
    const rota = { ...agregarB, replacement: ' -> fantasma' };
    expect(aplicarAlWorkspace(ws.puerto, [rota])).toMatchObject({ ok: false, motivo: 'invalida' });
    expect(ws.escrituras).toEqual([]);

    expect(aplicarAlWorkspace(ws.puerto, [rota], undefined, { aunqueNoCompile: true })).toMatchObject({ ok: true, cambiados: ['main.dg'] });
    expect(ws.texto('main.dg')).toContain('servicio a -> fantasma }');
  });

  it('aunqueNoCompile no salta los demas rechazos: rango invalido y archivo de un tema', () => {
    const ws = fake({ 'main.dg': texto }, { 'tema.dg': 'theme t {}\n' });
    const fuera = { file: 'main.dg', range: { start: { line: 99, column: 1 }, end: { line: 99, column: 1 } }, replacement: 'x' };
    expect(aplicarAlWorkspace(ws.puerto, [fuera], undefined, { aunqueNoCompile: true })).toMatchObject({ ok: false, motivo: 'rango-invalido' });
    const enTema = { file: 'tema.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n' };
    expect(aplicarAlWorkspace(ws.puerto, [enTema], undefined, { aunqueNoCompile: true })).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'tema.dg' });
    expect(ws.escrituras).toEqual([]);
  });
});
