/** Painted Effects (shadow, glow, glass, filter, decoration): they may stick out of the box without changing the Metrics. */
import type { PropertyDefinition } from './catalog';

export type EffectFamily = 'sombra' | 'glow' | 'vidrio' | 'filtro' | 'decoracion';

interface EffectDefinition {
  readonly familia: EffectFamily;
  readonly propiedades: Readonly<Record<string, PropertyDefinition>>;
  readonly afectaMetricas: false;
}

const num = (min: number, max: number, fallback: number): PropertyDefinition => ({ tipo: 'numero', min, max, defecto: fallback });
const color: PropertyDefinition = { tipo: 'color' };

export const EFFECT_CATALOG = {
  // The last shadow Layer goes on top; inset 1 draws it inside.
  shadow: { familia: 'sombra', afectaMetricas: false, propiedades: { color, x: num(-200, 200, 0), y: num(-200, 200, 4), blur: num(0, 200, 0), spread: num(-100, 100, 0), inset: num(0, 1, 0) } },
  glow: { familia: 'glow', afectaMetricas: false, propiedades: { color, radius: num(1, 100, 12), spread: num(0, 32, 0) } },
  // backdrop-filter over what is behind the box; saturate in %.
  glass: { familia: 'vidrio', afectaMetricas: false, propiedades: { blur: num(0, 64, 12), saturate: num(0, 300, 100) } },
  sketch: { familia: 'filtro', afectaMetricas: false, propiedades: { roughness: num(0, 20, 2), frequency: num(0.001, 0.5, 0.03) } },
  // Seeded rotation of the whole box, in degrees.
  tilt: { familia: 'decoracion', afectaMetricas: false, propiedades: { degrees: num(0, 3, 1) } },
  // Tape centered on the top border. Without `angle`, tilted with the element seed.
  tape: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(8, 200, 48), height: num(4, 60, 16), angle: { tipo: 'numero', min: -15, max: 15, opcional: true } } },
  // Band of `width` px on one side of the box, over its border and clipped by its outline.
  stripe: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, side: { tipo: 'opcion', valores: ['left', 'right', 'top', 'bottom'], defecto: 'left' }, width: num(1, 200, 4) } },
  // Two combs (top and bottom) sticking out `length` px; teeth of `width` px every `step` px, `margin` px free at the sides.
  pins: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 40, 4), step: num(2, 100, 11), length: num(1, 40, 6), margin: num(0, 200, 10) } },
  // Folded top-right corner: the outer triangle takes the page background; `shadow` is a hard shadow.
  fold: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, size: num(4, 60, 14), shadow: { tipo: 'color', opcional: true } } },
  ring: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 16, 2), offset: num(0, 32, 4) } },
} as const satisfies Record<string, EffectDefinition>;
