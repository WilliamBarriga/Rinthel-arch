import { describe, expect, it } from 'vitest';

import type { Theme } from 'canonical';
import { resolveStyle } from 'render';
import { NEUTRAL_THEME, metricsOf } from 'theme';

describe('resolveStyle', () => {
  it('delivers the colors and fonts of the Theme', () => {
    const style = resolveStyle(NEUTRAL_THEME, 'architecture');

    expect(style.background).toBe('#ffffff');
    expect(style.text).toBe('#1f2937');
    expect(style.border).toBe('#9ca3af');
    expect(style.bodyFont).toBe('sans-serif');
    expect(style.monoFont).toBe('monospace');
    expect(style.palette['blue']).toBe('#2563eb');
  });

  it('the error color is the Theme `error` token, with a default red, and does not depend on the ghost state', () => {
    const ownValue = resolveStyle({ ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, error: '#aa0000' } }, 'architecture');
    const byDefault = resolveStyle(NEUTRAL_THEME, 'architecture');

    expect(ownValue.errorColor).toBe('#aa0000');
    expect(byDefault.errorColor).toBe('#dc2626');
    expect(byDefault.errorColor).not.toBe(byDefault.states.ghost.color);
  });

  it('keeps the drawing defaults in one place', () => {
    const style = resolveStyle(NEUTRAL_THEME, 'architecture');

    expect(style.node).toEqual({ radius: 6, fill: '#ffffff', collapsedStroke: '6 3' });
    expect(style.paint.arista.capas[0]?.props['color']).toBe('#9ca3af');
    expect(style.paint.arista.fin).toEqual({ tipo: 'arrow', props: { size: 8, color: '#9ca3af' } });
    expect(style.label.halo).toEqual({ color: '#ffffff', width: 3 });
    expect(style.glyphs).toEqual({ expandedGlyph: '-', collapsedGlyph: '+' });
  });

  it('carries the Theme Metrics (the same layout measures)', () => {
    const theme: Theme = { ...NEUTRAL_THEME, tokens: { ...NEUTRAL_THEME.tokens, fontSize: '20px' } };

    expect(resolveStyle(theme, 'architecture').metrics).toEqual(metricsOf(theme, 'architecture'));
  });

  it('an incomplete Theme fails with a message naming what is missing', () => {
    const { border: _border, ...tokens } = NEUTRAL_THEME.tokens;

    expect(() => resolveStyle({ ...NEUTRAL_THEME, tokens }, 'architecture')).toThrow(/tokens\.border/);
    expect(() => resolveStyle({ ...NEUTRAL_THEME, fonts: {} }, 'architecture')).toThrow(/fonts\.body/);
  });
});
