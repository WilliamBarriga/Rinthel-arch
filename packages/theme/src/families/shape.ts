import type { PrimitiveDefinition } from '../catalog';

export const SHAPES = {
  pill: { familia: 'forma', afectaMetricas: false, propiedades: {} },
  cut: { familia: 'forma', afectaMetricas: false, propiedades: { cut: { tipo: 'numero', min: 1, max: 100, defecto: 8 } } },
  /** Asks for a square box that holds the content. */
  circle: { familia: 'forma', afectaMetricas: true, cajaMinima: 'cuadrado', propiedades: {} },
} as const satisfies Record<string, PrimitiveDefinition>;
