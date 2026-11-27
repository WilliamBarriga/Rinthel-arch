import { describe, expect, it } from 'vitest';

import { Diagram } from 'render';

describe('render', () => {
  it('is imported by package name and exposes the component', () => {
    expect(typeof Diagram).toBe('function');
  });
});
