import { describe, expect, it } from 'vitest';

import { islandRange, keyboardSize, sizeAfterDrag } from '../browser/frame/limits';

const canvas = { width: 1400, height: 900 };

describe('island resize limits', () => {
  it('width and height stay between the minimums and what the canvas leaves', () => {
    expect(islandRange(canvas)).toEqual({ width: { min: 220, max: 640 }, height: { min: 140, max: 836 } });
    // On a narrow canvas the maximum goes down, but never below the minimum.
    expect(islandRange({ width: 500, height: 100 })).toEqual({ width: { min: 220, max: 250 }, height: { min: 140, max: 140 } });
  });

  it('dragging the side handle of the left island to the right widens it; on the right island it narrows it', () => {
    const start = { width: 300, height: null, measuredHeight: 400 };

    expect(sizeAfterDrag(start, { dx: 50, dy: 0 }, { side: 'izquierda', axis: 'horizontal' }, canvas)).toEqual({ width: 350, height: null });
    expect(sizeAfterDrag(start, { dx: 50, dy: 0 }, { side: 'derecha', axis: 'horizontal' }, canvas)).toEqual({ width: 250, height: null });
  });

  it('the vertical drag starts from the measured content height and sets a height in px', () => {
    const start = { width: 300, height: null, measuredHeight: 400 };

    expect(sizeAfterDrag(start, { dx: 99, dy: 60 }, { side: 'izquierda', axis: 'vertical' }, canvas)).toEqual({ width: 300, height: 460 });
  });

  it('the corner moves both axes and is clamped to the limits', () => {
    const start = { width: 300, height: 300, measuredHeight: 500 };

    expect(sizeAfterDrag(start, { dx: -40, dy: 20 }, { side: 'derecha', axis: 'diagonal' }, canvas)).toEqual({ width: 340, height: 320 });
    expect(sizeAfterDrag(start, { dx: -2000, dy: -2000 }, { side: 'derecha', axis: 'diagonal' }, canvas)).toEqual({ width: 640, height: 140 });
  });

  it('the separator keyboard ("window splitter"): arrows by steps, Home to the minimum and End to the maximum', () => {
    const current = { width: 300, height: 300, measuredHeight: 300 };

    expect(keyboardSize('ArrowRight', current, { side: 'izquierda', axis: 'horizontal' }, canvas)).toEqual({ width: 316, height: 300 });
    expect(keyboardSize('ArrowRight', current, { side: 'derecha', axis: 'horizontal' }, canvas)).toEqual({ width: 284, height: 300 });
    expect(keyboardSize('ArrowDown', current, { side: 'derecha', axis: 'vertical' }, canvas)).toEqual({ width: 300, height: 316 });
    expect(keyboardSize('Home', current, { side: 'izquierda', axis: 'horizontal' }, canvas)).toEqual({ width: 220, height: 300 });
    expect(keyboardSize('End', current, { side: 'izquierda', axis: 'vertical' }, canvas)).toEqual({ width: 300, height: 836 });
    expect(keyboardSize('a', current, { side: 'izquierda', axis: 'vertical' }, canvas)).toBeUndefined();
  });
});
