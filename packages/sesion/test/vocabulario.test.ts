import { describe, expect, it } from 'vitest';

import { intencionDePinSchema } from 'sesion';
import type { IntencionDePin, MotivoDeRechazo } from 'sesion';

describe('vocabulario del Gesto', () => {
  it('el schema del cuerpo de POST /api/pin acepta una intencion valida y rechaza invalidas', () => {
    const valida = { vista: 'v', nodo: 'a', x: 1, y: 2, hash: 'h' };

    expect(intencionDePinSchema.safeParse(valida).success).toBe(true);
    expect(intencionDePinSchema.safeParse({ ...valida, x: '1' }).success).toBe(false);
    expect(intencionDePinSchema.safeParse({ vista: 'v', nodo: 'a', x: 1, y: 2 }).success).toBe(false);
  });

  it('sesion reexporta IntencionDePin y MotivoDeRechazo desde canonico', () => {
    const intencion: IntencionDePin = { vista: 'v', nodo: 'a', x: 1, y: 2, hash: 'h' };
    const motivo: MotivoDeRechazo = 'invalida';

    expect(intencion.nodo).toBe('a');
    expect(motivo).toBe('invalida');
  });
});
