/**
 * Text styles: `text` (Node Slot), `chip` (`counter` Slot), `icon` (`icon` Slot) and `label` (Edge label).
 * Only the measures go into the Metrics (`size`, `leading`, `pad`, `scale`, icon side...); the rest only paints.
 */
import type { PrimitiveDefinition, PropertyDefinition } from '../catalog';

/** Changes which font it is measured with. */
const FONT = { type: 'option', values: ['body', 'mono'], optional: true } as const satisfies PropertyDefinition;
/** Without it, 1 px. */
const BORDER_WIDTH = { type: 'number', min: 0, max: 8, optional: true } as const satisfies PropertyDefinition;

/** `size` relative to the Theme size and `leading` relative to `size`; without them the Slot rules (`SLOT_DEFINITION`). */
const TEXT_MEASURE = {
  size: { type: 'number', min: 0.4, max: 3, optional: true },
  leading: { type: 'number', min: 1, max: 5, optional: true },
} as const satisfies Record<string, PropertyDefinition>;

export const TEXTS = {
  text: {
    family: 'texto',
    placement: 'texto-slot',
    affectsMetrics: true,
    properties: {
      weight: { type: 'number', min: 100, max: 900, default: 400 },
      color: { type: 'color', optional: true },
      style: { type: 'option', values: ['normal', 'italic'], default: 'normal' },
      transform: { type: 'option', values: ['none', 'uppercase'], default: 'none' },
      font: FONT,
      alpha: { type: 'number', min: 0, max: 1, optional: true },
      /** Text alignment inside its rectangle; without it the Slot rules (the title is centered, the rest starts at the left). */
      'text-align': { type: 'option', values: ['start', 'center', 'end'], optional: true },
      ...TEXT_MEASURE,
      /** In em; also widens the measured text. */
      tracking: { type: 'number', min: 0, max: 1, default: 0 },
      /** With `fill` the Slot is a chip: its natural width plus `pad` on each side. */
      fill: { type: 'color', optional: true },
      border: { type: 'color', optional: true },
      'border-width': BORDER_WIDTH,
      radius: { type: 'number', min: 0, max: 50, default: 0 },
      pad: { type: 'number', min: 0, max: 32, default: 0 },
      /** Color dot before the text; it is one `size` (in em) wide. */
      dot: { type: 'color', optional: true },
      /** Text prepended to the Slot's (e.g. `"> "`): measured and painted as part of it. */
      prefix: { type: 'text', maxLength: 8, optional: true },
      glow: { type: 'color', optional: true },
    },
  },
  chip: {
    family: 'texto',
    placement: 'texto-slot',
    affectsMetrics: true,
    properties: {
      weight: { type: 'number', min: 100, max: 900, default: 700 },
      color: { type: 'color', optional: true },
      fill: { type: 'color', optional: true },
      border: { type: 'color', optional: true },
      'border-width': BORDER_WIDTH,
      radius: { type: 'number', min: 0, max: 50, default: 50 },
      size: TEXT_MEASURE.size,
      font: FONT,
    },
  },
  icon: {
    family: 'texto',
    placement: 'texto-slot',
    affectsMetrics: true,
    properties: {
      variant: { type: 'option', values: ['plain', 'box', 'dot'], default: 'plain' },
      /** In px. */
      side: { type: 'number', min: 6, max: 96, default: 16 },
      radius: { type: 'number', min: 0, max: 50, default: 6 },
      fill: { type: 'color', optional: true },
      /** In `dot`: the dot (4/9 of the side) sits on a ring of this color. */
      ring: { type: 'color', optional: true },
      border: { type: 'color', optional: true },
      'border-width': BORDER_WIDTH,
      /** Glyph color; without it, the stroke color of the Node kind. */
      color: { type: 'color', optional: true },
      /** In px; without it, in `box` it takes 60% of the side. Paint-only. */
      glyph: { type: 'number', min: 6, max: 96, optional: true },
    },
  },
  label: {
    family: 'texto',
    placement: 'etiqueta',
    affectsMetrics: true,
    properties: {
      scale: { type: 'number', min: 0.5, max: 2, default: 0.85 },
      pad: { type: 'number', min: 0, max: 32, default: 4 },
      'pad-y': { type: 'number', min: 0, max: 16, optional: true },
      radius: { type: 'number', min: 0, max: 50, default: 0 },
      fill: { type: 'color', optional: true },
      border: { type: 'color', optional: true },
      'border-width': { type: 'number', min: 0.5, max: 8, optional: true },
      /** Without `color`, the Theme's text color. */
      color: { type: 'color', optional: true },
      weight: { type: 'number', min: 100, max: 900, optional: true },
      font: FONT,
      /** Hard shadow offset 2 px down and right; `rotate` in degrees around the center. */
      shadow: { type: 'color', optional: true },
      rotate: { type: 'number', min: -15, max: 15, optional: true },
      style: { type: 'option', values: ['normal', 'italic'], optional: true },
    },
  },
} as const satisfies Record<string, PrimitiveDefinition>;
