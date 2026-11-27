import type { PrimitiveDefinition } from '../catalog';

const THICKNESS = { tipo: 'numero', min: 1, max: 16, defecto: 1 } as const;

export const BORDERS = {
  dashed: { familia: 'borde', afectaMetricas: false, propiedades: { color: { tipo: 'color' }, width: THICKNESS } },
  dotted: { familia: 'borde', afectaMetricas: false, propiedades: { color: { tipo: 'color' }, width: THICKNESS } },
  /** Outline outside the box, separated by `offset`; takes no space. */
  outline: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: THICKNESS, offset: { tipo: 'numero', min: -16, max: 16, defecto: 2 } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
