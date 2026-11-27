/**
 * Marker of an Edge end. `one`, `zero-one`, `many` and `zero-many` are the ER crow's feet, composite
 * because an end accepts a single marker; the core picks them by cardinality. Without `color`, the first stroke's.
 */
import type { PrimitiveDefinition } from '../catalog';

const marker = {
  family: 'marcador',
  placement: 'marcador',
  affectsMetrics: false,
  properties: {
    color: { type: 'color', optional: true },
    size: { type: 'number', min: 2, max: 32, default: 8 },
  },
} as const satisfies PrimitiveDefinition;

export const MARKERS = { arrow: marker, dot: marker, diamond: marker, square: marker, bar: marker, via: marker, hollow: marker, chevron: marker, one: marker, 'zero-one': marker, many: marker, 'zero-many': marker, cross: marker } as const;
