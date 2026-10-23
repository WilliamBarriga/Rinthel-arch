/**
 * Familia forma: contorno de la caja. `rect` vive en `catalogo.ts`; aqui las
 * demas. Una forma puede exigir una caja minima (`cajaMinima`), regla de
 * Metricas que `metricasDe` y la colocacion de Slots respetan.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

export const FORMAS = {
  pill: { familia: 'forma', afectaMetricas: false, propiedades: {} },
  cut: { familia: 'forma', afectaMetricas: false, propiedades: { cut: { tipo: 'numero', min: 1, max: 100, defecto: 8 } } },
  /** Pide una caja cuadrada que contenga el contenido, por eso afecta a las Metricas. */
  circle: { familia: 'forma', afectaMetricas: true, cajaMinima: 'cuadrado', propiedades: {} },
} as const satisfies Record<string, DefinicionDePrimitiva>;
