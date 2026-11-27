import type { PrimitiveDefinition } from '../catalog';

const THICKNESS = { type: 'number', min: 1, max: 16, default: 1 } as const;

export const BORDERS = {
  dashed: { family: 'borde', affectsMetrics: false, properties: { color: { type: 'color' }, width: THICKNESS } },
  dotted: { family: 'borde', affectsMetrics: false, properties: { color: { type: 'color' }, width: THICKNESS } },
  /** Outline outside the box, separated by `offset`; takes no space. */
  outline: {
    family: 'borde',
    affectsMetrics: false,
    properties: { color: { type: 'color' }, width: THICKNESS, offset: { type: 'number', min: -16, max: 16, default: 2 } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
