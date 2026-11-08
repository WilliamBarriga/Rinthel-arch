/**
 * Familia marcador (ADR 0008): el adorno de un extremo de Arista (origen o fin).
 * `via` es el anillo hueco de un via de PCB, `hollow` un anillo fino del color de
 * fondo y `chevron` una punta en V abierta. `one`, `zero-one`, `many` y `zero-many`
 * son los pies de gallo de la cardinalidad ER (compuestos, porque un extremo admite
 * un solo marcador); `cross` es la X que corta una Lifeline destruida; el nucleo los elige segun la cardinalidad de la Arista de una
 * Vista ER, el Tema solo cambia su `color` y `size`. Sin `color` toma el del primer
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

export const MARCADORES = { arrow: marcador, dot: marcador, diamond: marcador, square: marcador, bar: marcador, via: marcador, hollow: marcador, chevron: marcador, one: marcador, 'zero-one': marcador, many: marcador, 'zero-many': marcador, cross: marcador } as const;
