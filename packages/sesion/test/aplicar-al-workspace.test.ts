import { describe, expect, it } from 'vitest';

import { aplicarAlWorkspace, hashDeContenido } from 'sesion';
import type { Intencion, PuertoDeWorkspace } from 'sesion';

const texto = `specification { node servicio }
model { servicio a }
view v {
  type architecture
  include **
}
`;

/** Fake en memoria del Workspace: `propios` son los archivos escribibles; `temas` solo se leen. */
function fake(propios: Record<string, string>, temas: Record<string, string> = {}) {
  let actuales = { ...propios };
  const escrituras: string[] = [];
  const puerto: PuertoDeWorkspace = {
    leer: () => ({ disco: { ...temas, ...actuales }, propios: { ...actuales } }),
    escribir: (ruta, nuevo) => {
      escrituras.push(ruta);
      actuales = { ...actuales, [ruta]: nuevo };
    },
  };
  return { puerto, escrituras, texto: (ruta: string) => actuales[ruta] };
}

const mover = (_t: string, extra: Partial<Extract<Intencion, { tipo: 'mover-pin' }>> = {}): Intencion => ({
  tipo: 'mover-pin',
  vista: 'v',
  nodo: 'a',
  x: 4,
  y: 6,
  ...extra,
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
