/**
 * Marcador de un extremo de Arista. `one`, `zero-one`, `many` y `zero-many` son los pies de gallo ER, compuestos
 * porque un extremo admite un solo marcador; el nucleo los elige por cardinalidad. Sin `color`, el del primer trazo.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

const marcador = {
  familia: 'marcador',
  ubicacion: 'marcador',
  afectaMetricas: false,
  propiedades: {
    color: { tipo: 'color', opcional: true },
    size: { tipo: 'numero', min: 2, max: 32, defecto: 8 },
  },
} as const satisfies DefinicionDePrimitiva;

export const MARCADORES = { arrow: marcador, dot: marcador, diamond: marcador, square: marcador, bar: marcador, via: marcador, hollow: marcador, chevron: marcador, one: marcador, 'zero-one': marcador, many: marcador, 'zero-many': marcador, cross: marcador } as const;
