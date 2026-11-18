/** Efectos pintados (sombra, glow, vidrio, filtro, decoracion): pueden sobresalir de la caja sin cambiar las Metricas. */
import type { DefinicionDePropiedad } from './catalogo';

export type FamiliaDeEfectos = 'sombra' | 'glow' | 'vidrio' | 'filtro' | 'decoracion';

interface DefinicionDeEfecto {
  readonly familia: FamiliaDeEfectos;
  readonly propiedades: Readonly<Record<string, DefinicionDePropiedad>>;
  readonly afectaMetricas: false;
}

const num = (min: number, max: number, defecto: number): DefinicionDePropiedad => ({ tipo: 'numero', min, max, defecto });
const color: DefinicionDePropiedad = { tipo: 'color' };

export const CATALOGO_DE_EFECTOS = {
  // La ultima Capa shadow va encima; inset 1 la dibuja por dentro.
  shadow: { familia: 'sombra', afectaMetricas: false, propiedades: { color, x: num(-200, 200, 0), y: num(-200, 200, 4), blur: num(0, 200, 0), spread: num(-100, 100, 0), inset: num(0, 1, 0) } },
  glow: { familia: 'glow', afectaMetricas: false, propiedades: { color, radius: num(1, 100, 12), spread: num(0, 32, 0) } },
  // backdrop-filter sobre lo que hay detras de la caja; saturate en %.
  glass: { familia: 'vidrio', afectaMetricas: false, propiedades: { blur: num(0, 64, 12), saturate: num(0, 300, 100) } },
  sketch: { familia: 'filtro', afectaMetricas: false, propiedades: { roughness: num(0, 20, 2), frequency: num(0.001, 0.5, 0.03) } },
  // Giro sembrado de la caja entera, en grados.
  tilt: { familia: 'decoracion', afectaMetricas: false, propiedades: { degrees: num(0, 3, 1) } },
  // Cinta centrada sobre el borde superior. Sin `angle`, ladeada con la semilla del elemento.
  tape: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(8, 200, 48), height: num(4, 60, 16), angle: { tipo: 'numero', min: -15, max: 15, opcional: true } } },
  // Banda de `width` px en un lado de la caja, sobre su borde y recortada por su contorno.
  stripe: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, side: { tipo: 'opcion', valores: ['left', 'right', 'top', 'bottom'], defecto: 'left' }, width: num(1, 200, 4) } },
  // Dos peines (arriba y abajo) que sobresalen `length` px; dientes de `width` px cada `step` px, `margin` px libres a los lados.
  pins: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 40, 4), step: num(2, 100, 11), length: num(1, 40, 6), margin: num(0, 200, 10) } },
  // Esquina superior derecha doblada: el triangulo de fuera toma el fondo de pagina; `shadow` es una sombra dura.
  fold: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, size: num(4, 60, 14), shadow: { tipo: 'color', opcional: true } } },
  ring: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 16, 2), offset: num(0, 32, 4) } },
} as const satisfies Record<string, DefinicionDeEfecto>;
