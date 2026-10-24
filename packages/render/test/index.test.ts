import { describe, expect, it } from 'vitest';

import { Diagram } from 'render';

describe('render', () => {
  it('se importa por nombre de paquete y expone el componente', () => {
    expect(typeof Diagram).toBe('function');
  });
});
