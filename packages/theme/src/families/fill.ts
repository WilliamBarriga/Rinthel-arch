import type { PrimitiveDefinition } from '../catalog';

export const FILLS = {
  gradient: {
    family: 'relleno',
    affectsMetrics: false,
    textBackground: ['from', 'to'],
    properties: { from: { type: 'color' }, to: { type: 'color' }, angle: { type: 'number', min: 0, max: 360, default: 180 } },
  },
  /** Circular gradient from the point `x`/`y` (percentage of the box; may lie outside it) up to 110% of the radius. */
  radial: {
    family: 'relleno',
    affectsMetrics: false,
    properties: { from: { type: 'color' }, to: { type: 'color' }, x: { type: 'number', min: -100, max: 200, default: 50 }, y: { type: 'number', min: -100, max: 200, default: 50 } },
  },
  /** Disc of radius `radius` (px) centered at `x`/`y`: percentage of the box or page, or px from its top-left corner with `unit px`. */
  disc: {
    family: 'relleno',
    affectsMetrics: false,
    properties: {
      color: { type: 'color' },
      radius: { type: 'number', min: 1, max: 2000, default: 8 },
      x: { type: 'number', min: -2000, max: 2000, default: 50 },
      y: { type: 'number', min: -2000, max: 2000, default: 50 },
      unit: { type: 'option', values: ['percent', 'px'], default: 'percent' },
    },
  },
  grid: {
    family: 'relleno',
    affectsMetrics: false,
    properties: { color: { type: 'color' }, size: { type: 'number', min: 2, max: 200, default: 16 }, width: { type: 'number', min: 1, max: 8, default: 1 } },
  },
  lines: {
    family: 'relleno',
    affectsMetrics: false,
    properties: {
      color: { type: 'color' },
      size: { type: 'number', min: 2, max: 200, default: 8 },
      width: { type: 'number', min: 1, max: 8, default: 1 },
      angle: { type: 'number', min: 0, max: 180, default: 45 },
    },
  },
  dots: {
    family: 'relleno',
    affectsMetrics: false,
    properties: { color: { type: 'color' }, size: { type: 'number', min: 4, max: 200, default: 12 }, radius: { type: 'number', min: 1, max: 50, default: 2 } },
  },
  /** Fractal grain: gray without `color`. `color` is a Palette name: the grain is a separate image and `COLOR` does not reach it. */
  noise: {
    family: 'relleno',
    affectsMetrics: false,
    properties: { frequency: { type: 'number', min: 0.1, max: 2, default: 0.8 }, opacity: { type: 'number', min: 0, max: 1, default: 0.15 }, color: { type: 'color', optional: true } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
