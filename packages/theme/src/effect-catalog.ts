/** Painted Effects (shadow, glow, glass, filter, decoration): they may stick out of the box without changing the Metrics. */
import type { PropertyDefinition } from './catalog';

export type EffectFamily = 'sombra' | 'glow' | 'vidrio' | 'filtro' | 'decoracion';

interface EffectDefinition {
  readonly family: EffectFamily;
  readonly properties: Readonly<Record<string, PropertyDefinition>>;
  readonly affectsMetrics: false;
}

const num = (min: number, max: number, fallback: number): PropertyDefinition => ({ type: 'number', min, max, default: fallback });
const color: PropertyDefinition = { type: 'color' };

export const EFFECT_CATALOG = {
  // The last shadow Layer goes on top; inset 1 draws it inside.
  shadow: { family: 'sombra', affectsMetrics: false, properties: { color, x: num(-200, 200, 0), y: num(-200, 200, 4), blur: num(0, 200, 0), spread: num(-100, 100, 0), inset: num(0, 1, 0) } },
  glow: { family: 'glow', affectsMetrics: false, properties: { color, radius: num(1, 100, 12), spread: num(0, 32, 0) } },
  // backdrop-filter over what is behind the box; saturate in %.
  glass: { family: 'vidrio', affectsMetrics: false, properties: { blur: num(0, 64, 12), saturate: num(0, 300, 100) } },
  sketch: { family: 'filtro', affectsMetrics: false, properties: { roughness: num(0, 20, 2), frequency: num(0.001, 0.5, 0.03) } },
  // Seeded rotation of the whole box, in degrees.
  tilt: { family: 'decoracion', affectsMetrics: false, properties: { degrees: num(0, 3, 1) } },
  // Tape centered on the top border. Without `angle`, tilted with the element seed.
  tape: { family: 'decoracion', affectsMetrics: false, properties: { color, width: num(8, 200, 48), height: num(4, 60, 16), angle: { type: 'number', min: -15, max: 15, optional: true } } },
  // Band of `width` px on one side of the box, over its border and clipped by its outline.
  stripe: { family: 'decoracion', affectsMetrics: false, properties: { color, side: { type: 'option', values: ['left', 'right', 'top', 'bottom'], default: 'left' }, width: num(1, 200, 4) } },
  // Two combs (top and bottom) sticking out `length` px; teeth of `width` px every `step` px, `margin` px free at the sides.
  pins: { family: 'decoracion', affectsMetrics: false, properties: { color, width: num(1, 40, 4), step: num(2, 100, 11), length: num(1, 40, 6), margin: num(0, 200, 10) } },
  // Folded top-right corner: the outer triangle takes the page background; `shadow` is a hard shadow.
  fold: { family: 'decoracion', affectsMetrics: false, properties: { color, size: num(4, 60, 14), shadow: { type: 'color', optional: true } } },
  ring: { family: 'decoracion', affectsMetrics: false, properties: { color, width: num(1, 16, 2), offset: num(0, 32, 4) } },
} as const satisfies Record<string, EffectDefinition>;
