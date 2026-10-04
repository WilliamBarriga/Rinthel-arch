import { describe, expect, it } from 'vitest';

import { paquete } from 'shell';

describe('shell', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('shell');
  });
});
