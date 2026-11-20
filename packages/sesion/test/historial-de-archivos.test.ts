import { describe, expect, it } from 'vitest';

import { deshacerSobre, historialVacio, registrar, rehacerSobre } from 'sesion';
import type { HistorialDeArchivos } from 'sesion';

const v0 = { 'a.dg': 'a0', 'b.dg': 'b0' };
const v1 = { 'a.dg': 'a1', 'b.dg': 'b0' };

/** Historial con una entrada que cambia `a.dg` de `a0` a `a1`. */
const conUnaEntrada = (): HistorialDeArchivos => registrar(historialVacio, 'texto de a.dg', v0, v1);

describe('Historial de archivos (deshacer por archivo, ADR 0007)', () => {
  it('cada entrada guarda solo los archivos que cambio; registrar sin cambios no apila', () => {
    const h = conUnaEntrada();
    expect(h.pasado).toEqual([{ descripcion: 'texto de a.dg', cambios: { 'a.dg': { antes: 'a0', despues: 'a1' } } }]);
    expect(registrar(h, 'nada', v1, v1)).toBe(h);
  });

  it('deshacer y rehacer escriben solo los archivos de la entrada y conservan lo demas del disco', () => {
    const conB = { 'a.dg': 'a1', 'b.dg': 'b fuera' };
    const d = deshacerSobre(conUnaEntrada(), conB);
    expect(d).toMatchObject({ ok: true, archivos: { 'a.dg': 'a0', 'b.dg': 'b fuera' }, escritos: ['a.dg'] });
    if (!d.ok) return;
    expect(d.historial.pasado).toEqual([]);
    const r = rehacerSobre(d.historial, d.archivos);
    expect(r).toMatchObject({ ok: true, archivos: { 'a.dg': 'a1', 'b.dg': 'b fuera' } });
    if (r.ok) expect(r.historial.futuro).toEqual([]);
  });

  it('si cambio por fuera un archivo que la entrada restaura, rechaza con hash-desactualizado y no toca el Historial', () => {
    const h = conUnaEntrada();
    expect(deshacerSobre(h, { 'a.dg': 'a fuera', 'b.dg': 'b0' })).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'a.dg' });
    const d = deshacerSobre(h, v1);
    if (!d.ok) throw new Error('deberia deshacer');
    expect(rehacerSobre(d.historial, { 'a.dg': 'a otra', 'b.dg': 'b0' })).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'a.dg' });
  });

  it('sin entradas rechaza con nada-que-deshacer y nada-que-rehacer; una edicion nueva descarta el futuro', () => {
    expect(deshacerSobre(historialVacio, v0)).toMatchObject({ ok: false, motivo: 'nada-que-deshacer' });
    expect(rehacerSobre(historialVacio, v0)).toMatchObject({ ok: false, motivo: 'nada-que-rehacer' });
    const d = deshacerSobre(conUnaEntrada(), v1);
    if (!d.ok) throw new Error('deberia deshacer');
    const otra = registrar(d.historial, 'texto de b.dg', v0, { 'a.dg': 'a0', 'b.dg': 'b1' });
    expect(otra.futuro).toEqual([]);
    expect(otra.pasado.map((e) => e.descripcion)).toEqual(['texto de b.dg']);
  });

  it('un archivo creado por una entrada se borra al deshacerla y vuelve al rehacer', () => {
    const h = registrar(historialVacio, 'nuevo', v0, { ...v0, 'c.dg': 'c' });
    const d = deshacerSobre(h, { ...v0, 'c.dg': 'c' });
    expect(d).toMatchObject({ ok: true, archivos: v0, escritos: ['c.dg'] });
  });
});
