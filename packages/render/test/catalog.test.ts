import { describe, expect, it } from 'vitest';

import { NEUTRAL_THEME } from 'theme';

import { boxDeclarations } from '../src/sheet';
import { resolveStyle } from '../src/style';
import { borderWidth } from '../src/paint/common';

describe('border width of a stack', () => {
  it.each([
    ['border', {}],
    ['dashed', {}],
    ['dotted', {}],
    ['outline', { offset: 2 }],
  ])('the border Family (%s) counts as border', (kind, extra) => {
    expect(borderWidth([{ nombre: 'b', tipo: kind, props: { color: '#000', width: 3, ...extra } }] as never)).toBe(3);
  });
});

const box = (...layers: Array<[string, Record<string, string | number>]>) => {
  const style = resolveStyle({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: layers.map(([kind, props], i) => ({ nombre: `c${i}`, primitiva: { tipo: kind, props } })) } }, 'architecture');
  return boxDeclarations(style, style.paint.nodo);
};

describe('painters of the shape, fill and border catalog', () => {
  it('shapes translate to their CSS outline', () => {
    expect(box(['pill', {}])['border-radius']).toBe('9999px');
    expect(box(['circle', {}])['border-radius']).toBe('50%');
    expect(box(['cut', { cut: 12 }])).toEqual({ 'border-radius': '12px 0 12px 0', 'corner-shape': 'bevel' });
  });

  it('a solid fill under a pattern does not override it, even if it comes later', () => {
    const declarations = box(['grid', { color: 'gray', size: 10, width: 1 }], ['solid', { color: 'blue' }]);

    expect(declarations['background']).toBe('#2563eb');
    expect(declarations['background-image']).toContain('linear-gradient(to right,#6b7280 1px');
    expect(declarations['background-size']).toBe('10px 10px,10px 10px');
  });

  it('several patterns stack like the stack: the last Layer stays on top (first in CSS)', () => {
    const declarations = box(['gradient', { from: 'blue', to: 'gray', angle: 90 }], ['dots', { color: 'red', size: 8, radius: 1 }]);

    expect(declarations['background-image']).toBe('radial-gradient(circle,#dc2626 1px,transparent 1.5px),linear-gradient(90deg,#2563eb,#6b7280)');
    expect(declarations['background-size']).toBe('8px 8px,auto');
  });

  it('borders: dashed, dotted and outline', () => {
    expect(box(['dashed', { color: 'blue', width: 2 }])['border']).toBe('2px dashed #2563eb');
    expect(box(['dotted', { color: 'blue', width: 3 }])['border']).toBe('3px dotted #2563eb');
    expect(box(['outline', { color: 'blue', width: 2, offset: 3 }])).toMatchObject({ outline: '2px solid #2563eb', 'outline-offset': '3px' });
  });
});
