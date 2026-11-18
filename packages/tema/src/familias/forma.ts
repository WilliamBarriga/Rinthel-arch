import type { DefinicionDePrimitiva } from '../catalogo';

export const FORMAS = {
  pill: { familia: 'forma', afectaMetricas: false, propiedades: {} },
  cut: { familia: 'forma', afectaMetricas: false, propiedades: { cut: { tipo: 'numero', min: 1, max: 100, defecto: 8 } } },
  /** Pide una caja cuadrada que contenga el contenido. */
  circle: { familia: 'forma', afectaMetricas: true, cajaMinima: 'cuadrado', propiedades: {} },
} as const satisfies Record<string, DefinicionDePrimitiva>;
