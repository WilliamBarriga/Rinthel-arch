import { describe, expect, it } from 'vitest';

import { deshacerSobre, historialVacio, historialVisible, INICIO_DEL_HISTORIAL, registrar, rehacerSobre, saltar } from 'sesion';
import type { HistorialDeArchivos } from 'sesion';

const v0 = { 'a.dg': 'a0', 'b.dg': 'b0' };
const v1 = { 'a.dg': 'a1', 'b.dg': 'b0' };

/** Historial con una entrada que cambia `a.dg` de `a0` a `a1`. */
const conUnaEntrada = (): HistorialDeArchivos => registrar(historialVacio, 'texto de a.dg', v0, v1);

describe('Historial de archivos (deshacer por archivo, ADR 0007)', () => {
  it('cada entrada guarda solo los archivos que cambio; registrar sin cambios no apila', () => {
    const h = conUnaEntrada();
    expect(h.pasado).toEqual([{ id: 1, cuando: 0, descripcion: 'texto de a.dg', cambios: { 'a.dg': { antes: 'a0', despues: 'a1' } } }]);
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

describe('saltar en el Historial (#193)', () => {
  /** Tres entradas sobre `a.dg`: a0 -> a1 -> a2 -> a3 (ids 1, 2, 3). */
  const tres = (): HistorialDeArchivos => {
    let h = registrar(historialVacio, 'uno', { 'a.dg': 'a0' }, { 'a.dg': 'a1' });
    h = registrar(h, 'dos', { 'a.dg': 'a1' }, { 'a.dg': 'a2' });
    return registrar(h, 'tres', { 'a.dg': 'a2' }, { 'a.dg': 'a3' });
  };

  it('cada entrada lleva un id creciente que no se reutiliza al descartar el futuro', () => {
    const h = tres();
    expect(h.pasado.map((e) => e.id)).toEqual([1, 2, 3]);
    const d = deshacerSobre(h, { 'a.dg': 'a3' });
    if (!d.ok) throw new Error('deberia deshacer');
    const otra = registrar(d.historial, 'otra', { 'a.dg': 'a2' }, { 'a.dg': 'b' });
    expect(otra.pasado.map((e) => e.id)).toEqual([1, 2, 4]);
  });

  it('a una entrada del pasado deja el estado justo despues de ella, sin apilar y conservando el futuro', () => {
    const r = saltar(tres(), { 'a.dg': 'a3', 'b.dg': 'b' }, 1);
    expect(r).toMatchObject({ ok: true, archivos: { 'a.dg': 'a1', 'b.dg': 'b' }, escritos: ['a.dg'] });
    if (!r.ok) return;
    expect(r.historial.pasado.map((e) => e.descripcion)).toEqual(['uno']);
    expect(r.historial.futuro.map((e) => e.descripcion)).toEqual(['dos', 'tres']);
  });

  it('a una entrada del futuro rehace hasta ella; a Inicio deja el texto previo a la primera', () => {
    const inicio = saltar(tres(), { 'a.dg': 'a3' }, INICIO_DEL_HISTORIAL);
    expect(inicio).toMatchObject({ ok: true, archivos: { 'a.dg': 'a0' } });
    if (!inicio.ok) return;
    expect(inicio.historial.pasado).toEqual([]);
    const r = saltar(inicio.historial, inicio.archivos, 2);
    expect(r).toMatchObject({ ok: true, archivos: { 'a.dg': 'a2' } });
    if (r.ok) expect(r.historial.futuro.map((e) => e.descripcion)).toEqual(['tres']);
  });

  it('rechaza con hash-desactualizado si cambio por fuera un archivo que restaura, y con entrada-desconocida si el id no existe', () => {
    expect(saltar(tres(), { 'a.dg': 'fuera' }, 1)).toMatchObject({ ok: false, motivo: 'hash-desactualizado', file: 'a.dg' });
    expect(saltar(tres(), { 'a.dg': 'a3' }, 99)).toMatchObject({ ok: false, motivo: 'entrada-desconocida' });
  });

  it('un archivo que cambia y vuelve en el camino no se escribe', () => {
    let h = registrar(historialVacio, 'cambia', { 'a.dg': 'a0' }, { 'a.dg': 'a1' });
    h = registrar(h, 'vuelve', { 'a.dg': 'a1' }, { 'a.dg': 'a0' });
    expect(saltar(h, { 'a.dg': 'a0' }, INICIO_DEL_HISTORIAL)).toMatchObject({ ok: true, escritos: [] });
  });
});

describe('Historial visible (#193)', () => {
  it('cada entrada dice sus archivos y si es alcanzable; las que restaurarian un archivo cambiado por fuera llevan el motivo', () => {
    let h = registrar(historialVacio, 'a', { 'a.dg': 'a0', 'b.dg': 'b0' }, { 'a.dg': 'a1', 'b.dg': 'b0' }, 1000);
    h = registrar(h, 'b', { 'a.dg': 'a1', 'b.dg': 'b0' }, { 'a.dg': 'a1', 'b.dg': 'b1' }, 2000);
    const v = historialVisible(h, { 'a.dg': 'a fuera', 'b.dg': 'b1' });
    expect(v.pasado).toEqual([
      { id: 1, descripcion: 'a', archivos: ['a.dg'], cuando: 1000, alcanzable: true },
      { id: 2, descripcion: 'b', archivos: ['b.dg'], cuando: 2000, alcanzable: true },
    ]);
    expect(v.inicio).toMatchObject({ alcanzable: false, motivo: expect.stringContaining('a.dg') });
    expect(v.futuro).toEqual([]);
  });
});
