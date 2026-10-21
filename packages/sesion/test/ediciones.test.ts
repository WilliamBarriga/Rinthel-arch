import { describe, expect, it } from 'vitest';

import { abrirSesion, aplicarEdiciones, edicionDePin, hashDeContenido } from 'sesion';

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

describe('edicionDePin + aplicarEdiciones', () => {
  it('inserta un override nuevo sin tocar el resto del archivo', () => {
    const texto = base('');
    const edicion = edicionDePin({ 'main.dg': texto }, intencion(texto));
    expect(edicion.ok).toBe(true);
    if (!edicion.ok) return;

    const r = aplicarEdiciones({ 'main.dg': texto }, edicion.ediciones);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.archivos['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
  });

  it('anade el pin a un override existente sin pin', () => {
    const texto = base('  node a { label "A" }\n');
    const edicion = edicionDePin({ 'main.dg': texto }, intencion(texto));
    if (!edicion.ok) throw new Error(edicion.mensaje);

    const r = aplicarEdiciones({ 'main.dg': texto }, edicion.ediciones);

    expect(r.ok && r.archivos['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n'));
  });

  it('anade el pin a un override vacio', () => {
    const texto = base('  node a {}\n');
    const edicion = edicionDePin({ 'main.dg': texto }, intencion(texto));
    if (!edicion.ok) throw new Error(edicion.mensaje);

    const r = aplicarEdiciones({ 'main.dg': texto }, edicion.ediciones);

    expect(r.ok && r.archivos['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
  });

  it('reemplaza un pin existente y la Sesion resultante lo refleja sin issues nuevos', async () => {
    const texto = base('  node a { label "A" pin 1,2 }\n  node b { pin 100,100 }\n');
    const edicion = edicionDePin({ 'main.dg': texto }, intencion(texto));
    if (!edicion.ok) throw new Error(edicion.mensaje);

    const r = aplicarEdiciones({ 'main.dg': texto }, edicion.ediciones);

    expect(r.ok && r.archivos['main.dg']).toBe(base('  node a { label "A" pin 5,-7 }\n  node b { pin 100,100 }\n'));
    if (!r.ok) return;
    const sesion = abrirSesion(r.archivos);
    expect(await sesion.diagnosticar()).toEqual(await abrirSesion({ 'main.dg': texto }).diagnosticar());
    expect(sesion.fuente?.views[0]?.overrides.find((o) => o.node === 'a')?.pin).toEqual({ x: 5, y: -7 });
  });

  it('un hash desactualizado rechaza la edicion y no cambia nada', () => {
    const texto = base('');
    const obsoleto = { ...intencion(texto), hash: hashDeContenido('otra cosa') };

    const edicion = edicionDePin({ 'main.dg': texto }, obsoleto);

    expect(edicion).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
  });

  it('aplicarEdiciones rechaza todo si una de varias ediciones tiene hash viejo', () => {
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

  it('vista o nodo inexistente se rechazan', () => {
    const texto = base('');
    expect(edicionDePin({ 'main.dg': texto }, { ...intencion(texto), vista: 'nada' })).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(edicionDePin({ 'main.dg': texto }, { ...intencion(texto), nodo: 'nada' })).toMatchObject({ ok: false, motivo: 'invalida' });
  });
});
