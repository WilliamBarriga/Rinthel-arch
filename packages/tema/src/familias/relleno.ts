/** Familia relleno: lo que cubre la caja de un Nodo o la pagina. `solid` vive en `catalogo.ts`; aqui gradientes, patrones y ruido. */
import type { DefinicionDePrimitiva } from '../catalogo';

export const RELLENOS = {
  gradient: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { from: { tipo: 'color' }, to: { tipo: 'color' }, angle: { tipo: 'numero', min: 0, max: 360, defecto: 180 } },
  },
  /** Gradiente circular desde el punto `x`/`y` (porcentaje de la caja; puede quedar fuera de ella) hasta el 110% del radio. */
  radial: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { from: { tipo: 'color' }, to: { tipo: 'color' }, x: { tipo: 'numero', min: -100, max: 200, defecto: 50 }, y: { tipo: 'numero', min: -100, max: 200, defecto: 50 } },
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
  noise: {
    familia: 'relleno',
    afectaMetricas: false,
    propiedades: { frequency: { tipo: 'numero', min: 0.1, max: 2, defecto: 0.8 }, opacity: { tipo: 'numero', min: 0, max: 1, defecto: 0.15 } },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
