/**
 * Primitivas de las Familias de efectos pintados (ADR 0008): sombra, glow,
 * vidrio, filtro (mano alzada) y decoracion. Todas solo pintan: pueden sobresalir
 * de la caja sin reservar espacio ni cambiar las Metricas. Un archivo por grupo
 * de Familias para que el catalogo crezca sin tocar las demas.
 */
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
  // Varias Capas shadow se apilan (la ultima encima); blur 0 da sombra dura; inset 1 la dibuja por dentro.
  shadow: { familia: 'sombra', afectaMetricas: false, propiedades: { color, x: num(-200, 200, 0), y: num(-200, 200, 4), blur: num(0, 200, 0), spread: num(-100, 100, 0), inset: num(0, 1, 0) } },
  glow: { familia: 'glow', afectaMetricas: false, propiedades: { color, radius: num(1, 100, 12), spread: num(0, 32, 0) } },
  // backdrop-filter real: desenfoque y saturacion (en %) de lo que hay detras de la caja.
  glass: { familia: 'vidrio', afectaMetricas: false, propiedades: { blur: num(0, 64, 12), saturate: num(0, 300, 100) } },
  // Mano alzada: desplaza el contorno con ruido sembrado (feTurbulence + feDisplacementMap).
  sketch: { familia: 'filtro', afectaMetricas: false, propiedades: { roughness: num(0, 20, 2), frequency: num(0.001, 0.5, 0.03) } },
  // Giro sembrado de la caja entera, con tope de 3 grados.
  tilt: { familia: 'decoracion', afectaMetricas: false, propiedades: { degrees: num(0, 3, 1) } },
  // Cinta adhesiva centrada sobre el borde superior; sobresale de la caja. Sin `angle`, ladeada con la semilla del elemento.
  tape: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(8, 200, 48), height: num(4, 60, 16), angle: { tipo: 'numero', min: -15, max: 15, opcional: true } } },
  // Franja: banda de `width` px del color de la Capa en un lado de la caja, sobre su borde y recortada por su contorno.
  stripe: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, side: { tipo: 'opcion', valores: ['left', 'right', 'top', 'bottom'], defecto: 'left' }, width: num(1, 200, 4) } },
  // Pines: dos peines (arriba y abajo) que sobresalen `length` px de la caja, dientes de `width` px cada `step` px y `margin` px libres a los lados.
  pins: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 40, 4), step: num(2, 100, 11), length: num(1, 40, 6), margin: num(0, 200, 10) } },
  // Esquina superior derecha doblada: el triangulo de fuera toma el fondo de pagina, el de dentro `color`; `shadow`, sombra dura opcional.
  fold: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, size: num(4, 60, 14), shadow: { tipo: 'color', opcional: true } } },
  // Aro exterior separado del borde (outline); sobresale de la caja.
  ring: { familia: 'decoracion', afectaMetricas: false, propiedades: { color, width: num(1, 16, 2), offset: num(0, 32, 4) } },
} as const satisfies Record<string, DefinicionDeEfecto>;
