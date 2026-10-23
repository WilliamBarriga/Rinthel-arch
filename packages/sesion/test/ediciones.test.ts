import { describe, expect, it } from 'vitest';

import { abrirSesion, aplicarEdiciones, editarPin, hashDeContenido } from 'sesion';

const base = (extra: string) => `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
${extra}}
`;

const intencion = (texto: string, x = 5, y = -7) => ({
  vista: 'v',
  nodo: 'a',
  x,
  y,
  hash: hashDeContenido(texto),
});

describe('editarPin', () => {
  it('inserta un override nuevo sin tocar el resto del archivo', () => {
    const texto = base('');
    const r = editarPin({ 'main.dg': texto }, intencion(texto));

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.archivos['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
      expect(r.ediciones).toHaveLength(1);
      expect(r.issues.some((i) => i.severity === 'error')).toBe(false);
    }
  });

  it('anade el pin a un override existente sin pin', () => {
    const texto = base('  node a { label "A" }\n');
    const r = editarPin({ 'main.dg': texto }, intencion(texto));
    if (!r.ok) throw new Error(r.mensaje);

    expect(r.archivos['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n'));
  });

  it('anade el pin a un override vacio', () => {
    const texto = base('  node a {}\n');
    const r = editarPin({ 'main.dg': texto }, intencion(texto));
    if (!r.ok) throw new Error(r.mensaje);

    expect(r.archivos['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
  });

  it('reemplaza un pin existente y la Sesion resultante lo refleja sin issues nuevos', async () => {
    const texto = base('  node a { label "A" pin 1,2 }\n  node b { pin 100,100 }\n');
    const r = editarPin({ 'main.dg': texto }, intencion(texto));
    if (!r.ok) throw new Error(r.mensaje);

    expect(r.archivos['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n  node b { pin 100,100 }\n'));
    const sesion = abrirSesion(r.archivos);
    expect(await sesion.diagnosticar()).toEqual(await abrirSesion({ 'main.dg': texto }).diagnosticar());
    expect(sesion.fuente?.views[0]?.overrides.find((o) => o.node === 'a')?.pin).toEqual({ x: 5, y: -7 });
  });

  it('un hash desactualizado rechaza la edicion y no cambia nada', () => {
    const texto = base('');
    const obsoleto = { ...intencion(texto), hash: hashDeContenido('otra cosa') };

    const r = editarPin({ 'main.dg': texto }, obsoleto);

    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
  });

  it('vista o nodo inexistente se rechazan', () => {
    const texto = base('');
    expect(editarPin({ 'main.dg': texto }, { ...intencion(texto), vista: 'nada' })).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(editarPin({ 'main.dg': texto }, { ...intencion(texto), nodo: 'nada' })).toMatchObject({ ok: false, motivo: 'invalida' });
  });

  it('lleva el limite de coordenadas a la salida: redondea x e y a enteros y los limita a un rango razonable', () => {
    const texto = base('');
    const pin = (x: number, y: number) => {
      const e = editarPin({ 'main.dg': texto }, intencion(texto, x, y));
      return e.ok ? e.archivos['main.dg'] : e;
    };
    expect(pin(10.6, -3.4)).toBe(base('  node a { pin 11,-3 }\n'));
    expect(pin(1e12, -1e12)).toBe(base('  node a { pin 100000,-100000 }\n'));
    expect(pin(1e-9, -0.2)).toBe(base('  node a { pin 0,0 }\n'));
  });
});

describe('aplicarEdiciones', () => {
  it('aplica las ediciones del Gesto ya calculadas (entradas de --edits y del fix de validate)', () => {
    const texto = base('');
    const r = aplicarEdiciones({ 'main.dg': texto }, [
      {
        file: 'main.dg',
        range: { start: { line: 2, column: 30 }, end: { line: 2, column: 31 } },
        replacement: 'c',
        hash: hashDeContenido(texto),
      },
    ]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.archivos['main.dg']).toBe(base('').replace('servicio b', 'servicio c'));
      expect(r.issues.some((i) => i.severity === 'error')).toBe(false);
    }
  });

  it('rechaza todo si una de varias ediciones tiene hash viejo', () => {
    const rango = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
    const r = aplicarEdiciones(
      { 'a.dg': 'x', 'b.dg': 'y' },
      [
        { file: 'a.dg', range: rango, replacement: 'z', hash: hashDeContenido('x') },
        { file: 'b.dg', range: rango, replacement: 'z', hash: 'viejo' },
      ],
    );
    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'b.dg' });
  });

  it('rechaza una edicion que introduce errores', () => {
    const texto = base('');
    const punto = { line: 1, column: 1 };
    const r = aplicarEdiciones(
      { 'main.dg': texto },
      [{ file: 'main.dg', range: { start: punto, end: punto }, replacement: '}}}', hash: hashDeContenido(texto) }],
    );
    expect(r).toMatchObject({ ok: false, motivo: 'invalida' });
  });

  it('un error preexistente que cambia de mensaje no bloquea una edicion ajena', () => {
    // Mismo codigo y archivo; el mensaje cambia porque la edicion cambia un nombre citado en el.
    const roto = `specification { node servicio }
model { servicio a  servicio b  a -> nada }
view v {
  type architecture
  include **
}
`;
    const hash = hashDeContenido(roto);
    const r = aplicarEdiciones({ 'main.dg': roto }, [
      { file: 'main.dg', range: { start: { line: 2, column: 38 }, end: { line: 2, column: 42 } }, replacement: 'otra', hash },
    ]);
    expect(r).toMatchObject({ ok: true });
  });

  it('una edicion que anade un segundo error del mismo codigo en el mismo archivo se rechaza', () => {
    const roto = `specification { node servicio }
model { servicio a  servicio b  a -> nada }
view v {
  type architecture
  include **
}
`;
    const hash = hashDeContenido(roto);
    const r = aplicarEdiciones({ 'main.dg': roto }, [
      { file: 'main.dg', range: { start: { line: 2, column: 42 }, end: { line: 2, column: 42 } }, replacement: ' b -> fantasma', hash },
    ]);
    expect(r).toMatchObject({ ok: false, motivo: 'invalida' });
  });
});
