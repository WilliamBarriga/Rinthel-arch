/** Familia borde/trazo: contorno de la caja. `border` (continuo) vive en `catalogo.ts`; aqui los demas. */
import type { DefinicionDePrimitiva } from '../catalogo';

const GROSOR = { tipo: 'numero', min: 1, max: 16, defecto: 1 } as const;

export const BORDES = {
  dashed: { familia: 'borde', afectaMetricas: false, propiedades: { color: { tipo: 'color' }, width: GROSOR } },
  dotted: { familia: 'borde', afectaMetricas: false, propiedades: { color: { tipo: 'color' }, width: GROSOR } },
  /** Contorno fuera de la caja, separado por `offset`; no ocupa espacio. */
  outline: {
    familia: 'borde',
    afectaMetricas: false,
    propiedades: { color: { tipo: 'color' }, width: GROSOR, offset: { tipo: 'numero', min: -16, max: 16, defecto: 2 } },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
