import type { PrimitiveDefinition } from '../catalog';

export const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'pixel'] as const;
export const STROKE_CORNERS = ['sharp', 'chamfer', 'round'] as const;

export const STROKES = {
  line: {
    family: 'trazo',
    placement: 'capa-arista',
    affectsMetrics: false,
    properties: {
      color: { type: 'color' },
      width: { type: 'number', min: 0.5, max: 24, default: 1.5 },
      style: { type: 'option', values: STROKE_STYLES, default: 'solid' },
      corner: { type: 'option', values: STROKE_CORNERS, default: 'sharp' },
      /** Side of the cut of a `chamfer` corner. */
      cut: { type: 'number', min: 1, max: 32, default: 6 },
      /** Radius of a `round` corner; capped at half the shortest segment. */
      radius: { type: 'number', min: 1, max: 64, default: 8 },
      /** End cap (`butt`, `round`, `square`); without it, its style's (round in `dotted`, butt in the rest). */
      cap: { type: 'option', values: ['butt', 'round', 'square'], optional: true },
      /** Hand-drawn: noise displacement (without it, or 0, no filter); `frequency` defaults to 0.03. */
      roughness: { type: 'number', min: 0, max: 20, optional: true },
      frequency: { type: 'number', min: 0.001, max: 0.5, optional: true },
    },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
