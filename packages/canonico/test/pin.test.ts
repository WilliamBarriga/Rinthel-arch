import { describe, expect, it } from 'vitest';

import { intencionDePinSchema, salidaDeEditSchema } from 'canonico';
import type { IntencionDePin, MotivoDeRechazo } from 'canonico';

describe('intencionDePinSchema', () => {
  it('acepta la intencion de mover un Pin { vista, nodo, x, y, hash }', () => {
    const cuerpo = { vista: 'arquitectura', nodo: 'rinthel.api', x: 10.5, y: -3, hash: 'abc123' };

    expect(intencionDePinSchema.parse(cuerpo)).toEqual(cuerpo);
  });

  it('rechaza coordenadas no finitas', () => {
    for (const x of [Infinity, -Infinity, NaN, '5', null]) {
      const cuerpo = { vista: 'v', nodo: 'a', x, y: 0, hash: 'h' };

      expect(intencionDePinSchema.safeParse(cuerpo).success).toBe(false);
    }
  });

  it('rechaza el cuerpo incompleto o con campos de otro tipo', () => {
    const intencion: IntencionDePin = { vista: 'v', nodo: 'a', x: 0, y: 0, hash: 'h' };
    const infectado = (campo: keyof Omit<IntencionDePin, 'x' | 'y'> | 'x' | 'y'): Record<string, unknown> => ({
      ...intencion,
      [campo]: campo === 'x' || campo === 'y' ? 'norte' : 42,
    });

    expect(intencionDePinSchema.safeParse(infectado('vista')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('nodo')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('hash')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('x')).success).toBe(false);
    expect(intencionDePinSchema.safeParse(infectado('y')).success).toBe(false);
    expect(intencionDePinSchema.safeParse({ ...intencion, hash: undefined }).success).toBe(false);
    expect(intencionDePinSchema.safeParse({ vista: 'v', nodo: 'a', x: 0, y: 0 }).success).toBe(false);
  });
});

describe('MotivoDeRechazo', () => {
  it('es un tipo cuyos valores se asignan como motivo de rechazo', () => {
    const motivos: MotivoDeRechazo[] = [
      'hash-desactualizado',
      'archivo-desconocido',
      'rango-invalido',
      'ediciones-solapadas',
      'vista-desconocida',
      'invalida',
    ];

    expect(motivos).toHaveLength(6);
  });

  it('alimenta el enum reason de la salida de edit (un solo sitio para un motivo)', () => {
    // Los seis motivos de hoy, escritos a mano como fuente de verdad independiente.
    const motivos = [
      'hash-desactualizado',
      'archivo-desconocido',
      'rango-invalido',
      'ediciones-solapadas',
      'vista-desconocida',
      'invalida',
    ] as const;

    for (const reason of motivos) {
      const salida = salidaDeEditSchema.safeParse({ contractVersion: 1, ok: false, reason, message: 'x' });

      expect(salida.success, reason).toBe(true);
    }
    expect(salidaDeEditSchema.safeParse({ contractVersion: 1, ok: false, reason: 'futuro', message: 'x' }).success).toBe(false);
  });
});
