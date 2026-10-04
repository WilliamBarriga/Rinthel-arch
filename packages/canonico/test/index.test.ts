import { describe, expect, it } from 'vitest';

import { paquete } from 'canonico';

describe('canonico', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('canonico');
  });
});
