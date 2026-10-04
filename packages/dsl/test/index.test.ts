import { describe, expect, it } from 'vitest';

import { paquete } from 'dsl';

describe('dsl', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('dsl');
  });
});
