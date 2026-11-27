/**
 * Marker of an Edge end. `one`, `zero-one`, `many` and `zero-many` are the ER crow's feet, composite
 * because an end accepts a single marker; the core picks them by cardinality. Without `color`, the first stroke's.
 */
import type { PrimitiveDefinition } from '../catalog';

const marker = {
  familia: 'marcador',
  ubicacion: 'marcador',
  afectaMetricas: false,
  propiedades: {
    color: { tipo: 'color', opcional: true },
    size: { tipo: 'numero', min: 2, max: 32, defecto: 8 },
  },
} as const satisfies PrimitiveDefinition;

export const MARKERS = { arrow: marker, dot: marker, diamond: marker, square: marker, bar: marker, via: marker, hollow: marker, chevron: marker, one: marker, 'zero-one': marker, many: marker, 'zero-many': marker, cross: marker } as const;
