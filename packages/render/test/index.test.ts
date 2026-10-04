import { describe, expect, it } from 'vitest';

import { paquete } from 'render';

describe('render', () => {
  it('se importa por nombre de paquete y expone su identidad', () => {
    expect(paquete).toBe('render');
  });
});
