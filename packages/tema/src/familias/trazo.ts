/**
 * Familia trazo (ADR 0008): la Capa de una Arista. La pila de trazos va de abajo
 * hacia arriba; un segundo trazo ancho y translucido sobre el principal da el
 * glow. Solo pinta: ningun trazo cambia las Metricas.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

export const ESTILOS_DE_TRAZO = ['solid', 'dashed', 'dotted', 'pixel'] as const;
export const ESQUINAS_DE_TRAZO = ['sharp', 'chamfer', 'round'] as const;

export const TRAZOS = {
  line: {
    familia: 'trazo',
    ubicacion: 'capa-arista',
    afectaMetricas: false,
    propiedades: {
      color: { tipo: 'color' },
      width: { tipo: 'numero', min: 0.5, max: 24, defecto: 1.5 },
      style: { tipo: 'opcion', valores: ESTILOS_DE_TRAZO, defecto: 'solid' },
      corner: { tipo: 'opcion', valores: ESQUINAS_DE_TRAZO, defecto: 'sharp' },
      /** Lado del corte de una esquina `chamfer`. */
      cut: { tipo: 'numero', min: 1, max: 32, defecto: 6 },
      /** Radio de una esquina `round`; se limita a la mitad del segmento mas corto. */
      radius: { tipo: 'numero', min: 1, max: 64, defecto: 8 },
    },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
