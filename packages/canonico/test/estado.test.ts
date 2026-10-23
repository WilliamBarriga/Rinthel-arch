import { describe, expect, it } from 'vitest';

import { estadoDeDevSchema, intencionSchema } from 'canonico';

describe('estadoDeDevSchema', () => {
  it('valida un estado sin Fuente (Workspace con errores desde el inicio)', () => {
    const estado = {
      version: 1,
      iconos: {},
      vistas: [],
      archivosDeVista: {},
      hashes: { 'main.dg': 'abc' },
      issues: [{ file: 'main.dg', line: 1, column: 1, severity: 'error', code: 'E_X', message: 'm', href: 'vscode://file/x' }],
    };
    expect(estadoDeDevSchema.parse(estado)).toMatchObject({ version: 1, hashes: { 'main.dg': 'abc' } });
  });

  it('rechaza un estado sin version', () => {
    expect(estadoDeDevSchema.safeParse({ iconos: {}, vistas: [], archivosDeVista: {}, hashes: {}, issues: [] }).success).toBe(false);
  });
});

describe('intencionSchema (union de Intenciones de /api/edit)', () => {
  it('acepta mover-pin y rechaza un tipo desconocido o ausente', () => {
    const pin = { vista: 'v', nodo: 'a', x: 1, y: 2, hash: 'h' };
    expect(intencionSchema.parse({ tipo: 'mover-pin', ...pin })).toEqual({ tipo: 'mover-pin', ...pin });
    expect(intencionSchema.safeParse(pin).success).toBe(false);
    expect(intencionSchema.safeParse({ tipo: 'otra', ...pin }).success).toBe(false);
  });
});
