import { describe, expect, it } from 'vitest';

import { Diagram, renderToSvgString } from 'render';

describe('render', () => {
  it('se importa por nombre de paquete y expone el componente y el export estatico', () => {
    expect(typeof Diagram).toBe('function');
    expect(typeof renderToSvgString).toBe('function');
  });
});
