/**
 * Text styles: `text` (Node Slot), `chip` (`counter` Slot), `icon` (`icon` Slot) and `label` (Edge label).
 * Only the measures go into the Metrics (`size`, `leading`, `pad`, `scale`, icon side...); the rest only paints.
 */
import type { PrimitiveDefinition, PropertyDefinition } from '../catalog';

/** Changes which font it is measured with. */
const FONT = { tipo: 'opcion', valores: ['body', 'mono'], opcional: true } as const satisfies PropertyDefinition;
/** Without it, 1 px. */
const BORDER_WIDTH = { tipo: 'numero', min: 0, max: 8, opcional: true } as const satisfies PropertyDefinition;

/** `size` relative to the Theme size and `leading` relative to `size`; without them the Slot rules (`SLOT_DEFINITION`). */
const TEXT_MEASURE = {
  size: { tipo: 'numero', min: 0.4, max: 3, opcional: true },
  leading: { tipo: 'numero', min: 1, max: 5, opcional: true },
} as const satisfies Record<string, PropertyDefinition>;

export const TEXTS = {
  text: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      weight: { tipo: 'numero', min: 100, max: 900, defecto: 400 },
      color: { tipo: 'color', opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], defecto: 'normal' },
      transform: { tipo: 'opcion', valores: ['none', 'uppercase'], defecto: 'none' },
      font: FONT,
      alpha: { tipo: 'numero', min: 0, max: 1, opcional: true },
      /** Text alignment inside its rectangle; without it the Slot rules (the title is centered, the rest starts at the left). */
      'text-align': { tipo: 'opcion', valores: ['start', 'center', 'end'], opcional: true },
      ...TEXT_MEASURE,
      /** In em; also widens the measured text. */
      tracking: { tipo: 'numero', min: 0, max: 1, defecto: 0 },
      /** With `fill` the Slot is a chip: its natural width plus `pad` on each side. */
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': BORDER_WIDTH,
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 0 },
      /** Color dot before the text; it is one `size` (in em) wide. */
      dot: { tipo: 'color', opcional: true },
      /** Text prepended to the Slot's (e.g. `"> "`): measured and painted as part of it. */
      prefix: { tipo: 'texto', largo: 8, opcional: true },
      glow: { tipo: 'color', opcional: true },
    },
  },
  chip: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      weight: { tipo: 'numero', min: 100, max: 900, defecto: 700 },
      color: { tipo: 'color', opcional: true },
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': BORDER_WIDTH,
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 50 },
      size: TEXT_MEASURE.size,
      font: FONT,
    },
  },
  icon: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      variant: { tipo: 'opcion', valores: ['plain', 'box', 'dot'], defecto: 'plain' },
      /** In px. */
      side: { tipo: 'numero', min: 6, max: 96, defecto: 16 },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 6 },
      fill: { tipo: 'color', opcional: true },
      /** In `dot`: the dot (4/9 of the side) sits on a ring of this color. */
      ring: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': BORDER_WIDTH,
      /** Glyph color; without it, the stroke color of the Node kind. */
      color: { tipo: 'color', opcional: true },
      /** In px; without it, in `box` it takes 60% of the side. Paint-only. */
      glyph: { tipo: 'numero', min: 6, max: 96, opcional: true },
    },
  },
  label: {
    familia: 'texto',
    ubicacion: 'etiqueta',
    afectaMetricas: true,
    propiedades: {
      scale: { tipo: 'numero', min: 0.5, max: 2, defecto: 0.85 },
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 4 },
      'pad-y': { tipo: 'numero', min: 0, max: 16, opcional: true },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': { tipo: 'numero', min: 0.5, max: 8, opcional: true },
      /** Without `color`, the Theme's text color. */
      color: { tipo: 'color', opcional: true },
      weight: { tipo: 'numero', min: 100, max: 900, opcional: true },
      font: FONT,
      /** Hard shadow offset 2 px down and right; `rotate` in degrees around the center. */
      shadow: { tipo: 'color', opcional: true },
      rotate: { tipo: 'numero', min: -15, max: 15, opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], opcional: true },
    },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
