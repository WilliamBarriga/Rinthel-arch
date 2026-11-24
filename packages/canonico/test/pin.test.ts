import { describe, expect, it } from 'vitest';

import { intencionDePinSchema, salidaDeEditSchema } from 'canonico';
import type { IntencionDePin } from 'canonico';

describe('intencionDePinSchema', () => {
  it('acepta la intencion de mover un Pin { view, node, x, y } y descarta un hash heredado', () => {
    const cuerpo = { view: 'arquitectura', node: 'rinthel.api', x: 10.5, y: -3 };

    expect(intencionDePinSchema.parse(cuerpo)).toEqual(cuerpo);
    expect(intencionDePinSchema.parse({ ...cuerpo, hash: 'abc123' })).toEqual(cuerpo);
  });

  it('rechaza coordenadas no finitas', () => {
    for (const x of [Infinity, -Infinity, NaN, '5', null]) {
      const cuerpo = { view: 'v', node: 'a', x, y: 0 };

      expect(intencionDePinSchema.safeParse(cuerpo).success).toBe(false);
    }
  });

  it('rechaza el cuerpo incompleto o con campos de otro tipo', () => {
    const intencion: IntencionDePin = { view: 'v', node: 'a', x: 0, y: 0 };
    const infectado = (campo: keyof Omit<IntencionDePin, 'x' | 'y'> | 'x' | 'y'): Record<string, unknown> => ({
      ...intencion,
      [campo]: campo === 'x' || campo === 'y' ? 'norte' : 42,
    });

    expect(intencionDePinSchema.safeParse(infectado('view')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('node')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('x')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('y')).success).toBe(false);
    expect(intencionDePinSchema.safeParse({ view: 'v', node: 'a', x: 0 }).success).toBe(false);
  });
});

describe('MotivoDeRechazo', () => {
  it('alimenta el enum reason de la salida de edit (un solo sitio para un motivo)', () => {
    // Escritos a mano como fuente de verdad independiente.
    const motivos = [
      'stale-hash',
      'unknown-file',
      'invalid-range',
      'overlapping-edits',
      'unknown-view',
      'invalid',
      'nothing-to-undo',
      'nothing-to-redo',
      'unknown-theme',
      'unknown-entry',
    ] as const;

    for (const reason of motivos) {
      const salida = salidaDeEditSchema.safeParse({ contractVersion: 2, ok: false, reason, message: 'x' });

      expect(salida.success, reason).toBe(true);
    }
    expect(salidaDeEditSchema.safeParse({ contractVersion: 2, ok: false, reason: 'futuro', message: 'x' }).success).toBe(false);
  });
});
