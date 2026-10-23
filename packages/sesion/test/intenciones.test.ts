import { describe, expect, it } from 'vitest';

import {
  aplicarIntencion,
  crearHistorial,
  deshacer,
  editarEnHistorial,
  hashDeContenido,
  rehacer,
} from 'sesion';
import type { Intencion } from 'sesion';

const base = (extra: string) => `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
${extra}}
`;

const mover = (texto: string, x: number, y: number, nodo = 'a'): Intencion => ({
  tipo: 'mover-pin',
  vista: 'v',
  nodo,
  x,
  y,
  hash: hashDeContenido(texto),
});

describe('aplicarIntencion', () => {
  it('mover Pin produce el mismo texto que escribir el pin a mano', () => {
    const texto = base('');
    const r = aplicarIntencion({ 'main.dg': texto }, mover(texto, 5, -7));
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.archivos['main.dg']).toBe(base('  node a { pin 5,-7 }\n'));
    expect(r.ediciones).toHaveLength(1);
  });

  it('rechaza con motivo', () => {
    const texto = base('');
    const r = aplicarIntencion({ 'main.dg': texto }, { ...mover(texto, 1, 1), hash: 'viejo' });
    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
  });
});

describe('historial de deshacer y rehacer', () => {
  it('mover un Pin y deshacer restaura el texto exactamente; rehacer lo reaplica', () => {
    const texto = base('  node b { label "B" }\n');
    const e = editarEnHistorial(crearHistorial({ 'main.dg': texto }), mover(texto, 3, 4));
    if (!e.ok) throw new Error(e.mensaje);
    expect(e.historial.archivos['main.dg']).not.toBe(texto);

    const d = deshacer(e.historial);
    expect(d?.archivos['main.dg']).toBe(texto);
    const r = d && rehacer(d);
    expect(r?.archivos).toEqual(e.historial.archivos);
  });

  it('sin nada que deshacer o rehacer devuelve undefined', () => {
    const h = crearHistorial({ 'main.dg': base('') });
    expect(deshacer(h)).toBeUndefined();
    expect(rehacer(h)).toBeUndefined();
  });

  it('una edicion nueva descarta el futuro y un rechazo no altera el historial', () => {
    const texto = base('');
    const e1 = editarEnHistorial(crearHistorial({ 'main.dg': texto }), mover(texto, 1, 1));
    if (!e1.ok) throw new Error(e1.mensaje);
    const d = deshacer(e1.historial);
    if (!d) throw new Error('sin deshacer');
    const e2 = editarEnHistorial(d, mover(texto, 9, 9));
    if (!e2.ok) throw new Error(e2.mensaje);
    expect(rehacer(e2.historial)).toBeUndefined();

    const mala = editarEnHistorial(e2.historial, { ...mover(texto, 0, 0), hash: 'viejo' });
    expect(mala.ok).toBe(false);
    expect(deshacer(e2.historial)?.archivos['main.dg']).toBe(texto);
  });

  it('dos ediciones se deshacen en orden inverso', () => {
    const t0 = base('');
    const e1 = editarEnHistorial(crearHistorial({ 'main.dg': t0 }), mover(t0, 1, 1));
    if (!e1.ok) throw new Error(e1.mensaje);
    const t1 = e1.historial.archivos['main.dg'] as string;
    const e2 = editarEnHistorial(e1.historial, mover(t1, 2, 2));
    if (!e2.ok) throw new Error(e2.mensaje);
    const d1 = deshacer(e2.historial);
    expect(d1?.archivos['main.dg']).toBe(t1);
    expect(d1 && deshacer(d1)?.archivos['main.dg']).toBe(t0);
  });
});
