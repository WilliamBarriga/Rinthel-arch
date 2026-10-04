import { describe, expect, it } from 'vitest';

import { paquete } from 'layout';

describe('layout', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('layout');
  });
});
