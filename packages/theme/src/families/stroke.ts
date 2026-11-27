import type { PrimitiveDefinition } from '../catalog';

export const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'pixel'] as const;
export const STROKE_CORNERS = ['sharp', 'chamfer', 'round'] as const;

export const STROKES = {
  line: {
    familia: 'trazo',
    ubicacion: 'capa-arista',
    afectaMetricas: false,
    propiedades: {
      color: { tipo: 'color' },
      width: { tipo: 'numero', min: 0.5, max: 24, defecto: 1.5 },
      style: { tipo: 'opcion', valores: STROKE_STYLES, defecto: 'solid' },
      corner: { tipo: 'opcion', valores: STROKE_CORNERS, defecto: 'sharp' },
      /** Side of the cut of a `chamfer` corner. */
      cut: { tipo: 'numero', min: 1, max: 32, defecto: 6 },
      /** Radius of a `round` corner; capped at half the shortest segment. */
      radius: { tipo: 'numero', min: 1, max: 64, defecto: 8 },
      /** End cap (`butt`, `round`, `square`); without it, its style's (round in `dotted`, butt in the rest). */
      cap: { tipo: 'opcion', valores: ['butt', 'round', 'square'], opcional: true },
      /** Hand-drawn: noise displacement (without it, or 0, no filter); `frequency` defaults to 0.03. */
      roughness: { tipo: 'numero', min: 0, max: 20, opcional: true },
      frequency: { tipo: 'numero', min: 0.001, max: 0.5, opcional: true },
    },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
