import type { PrimitiveDefinition } from '../catalog';

export const SHAPES = {
  pill: { family: 'forma', affectsMetrics: false, properties: {} },
  cut: { family: 'forma', affectsMetrics: false, properties: { cut: { type: 'number', min: 1, max: 100, default: 8 } } },
  /** Asks for a square box that holds the content. */
  circle: { family: 'forma', affectsMetrics: true, minimumBox: 'square', properties: {} },
} as const satisfies Record<string, PrimitiveDefinition>;
