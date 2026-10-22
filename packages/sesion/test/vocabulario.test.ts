import { describe, expect, it } from 'vitest';

import { intencionDePinSchema as schemaDeCanonico } from 'canonico';
import { intencionDePinSchema as schemaDeSesion } from 'sesion';
import type { IntencionDePin, MotivoDeRechazo } from 'sesion';

describe('vocabulario del Gesto', () => {
  it('sesion reexporta el schema del cuerpo de POST /api/pin que vive en canonico', () => {
    expect(schemaDeSesion).toBe(schemaDeCanonico);
  });

  it('sesion reexporta IntencionDePin y MotivoDeRechazo desde canonico', () => {
    const intencion: IntencionDePin = { vista: 'v', nodo: 'a', x: 1, y: 2, hash: 'h' };
    const motivo: MotivoDeRechazo = 'invalida';

    expect(intencion.nodo).toBe('a');
    expect(motivo).toBe('invalida');
  });
});
