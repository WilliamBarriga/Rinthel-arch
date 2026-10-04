import { describe, expect, it } from 'vitest';

import { paquete } from 'cli';

describe('cli', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('cli');
  });
});
