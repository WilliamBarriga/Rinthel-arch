/**
 * Familia marcador (ADR 0008): el adorno de un extremo de Arista (origen o fin).
 * `via` es el anillo hueco de un via de PCB. Sin `color` toma el del primer
 * trazo. Solo pinta.
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

export const MARCADORES = { arrow: marcador, dot: marcador, diamond: marcador, square: marcador, bar: marcador, via: marcador } as const;
