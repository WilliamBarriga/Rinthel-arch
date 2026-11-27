import type { PrimitiveDefinition } from '../catalog';

export const FILLS = {
  gradient: {
    familia: 'relleno',
    afectaMetricas: false,
    fondoDeTexto: ['from', 'to'],
    propiedades: { from: { tipo: 'color' }, to: { tipo: 'color' }, angle: { tipo: 'numero', min: 0, max: 360, defecto: 180 } },
  },
  /** Circular gradient from the point `x`/`y` (percentage of the box; may lie outside it) up to 110% of the radius. */
  radial: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { from: { tipo: 'color' }, to: { tipo: 'color' }, x: { tipo: 'numero', min: -100, max: 200, defecto: 50 }, y: { tipo: 'numero', min: -100, max: 200, defecto: 50 } },
  },
  /** Disc of radius `radius` (px) centered at `x`/`y`: percentage of the box or page, or px from its top-left corner with `unit px`. */
  disc: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: {
      color: { tipo: 'color' },
      radius: { tipo: 'numero', min: 1, max: 2000, defecto: 8 },
      x: { tipo: 'numero', min: -2000, max: 2000, defecto: 50 },
      y: { tipo: 'numero', min: -2000, max: 2000, defecto: 50 },
      unit: { tipo: 'opcion', valores: ['percent', 'px'], defecto: 'percent' },
    },
  },
  grid: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, size: { tipo: 'numero', min: 2, max: 200, defecto: 16 }, width: { tipo: 'numero', min: 1, max: 8, defecto: 1 } },
  },
  lines: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: {
      color: { tipo: 'color' },
      size: { tipo: 'numero', min: 2, max: 200, defecto: 8 },
      width: { tipo: 'numero', min: 1, max: 8, defecto: 1 },
      angle: { tipo: 'numero', min: 0, max: 180, defecto: 45 },
    },
  },
  dots: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, size: { tipo: 'numero', min: 4, max: 200, defecto: 12 }, radius: { tipo: 'numero', min: 1, max: 50, defecto: 2 } },
  },
  /** Fractal grain: gray without `color`. `color` is a Palette name: the grain is a separate image and `COLOR` does not reach it. */
  noise: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { frequency: { tipo: 'numero', min: 0.1, max: 2, defecto: 0.8 }, opacity: { tipo: 'numero', min: 0, max: 1, defecto: 0.15 }, color: { tipo: 'color', opcional: true } },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
