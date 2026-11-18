/**
 * Estilos de texto: `text` (Slot de Nodo), `chip` (Slot `counter`), `icon` (Slot `icon`) y `label` (etiqueta de Arista).
 * Entran en las Metricas solo las medidas (`size`, `leading`, `pad`, `scale`, lado del icono...); el resto solo pinta.
 */
import type { DefinicionDePrimitiva, DefinicionDePropiedad } from '../catalogo';

/** Cambia con que fuente se mide. */
const FUENTE = { tipo: 'opcion', valores: ['body', 'mono'], opcional: true } as const satisfies DefinicionDePropiedad;
/** Sin el, 1 px. */
const ANCHO_DE_BORDE = { tipo: 'numero', min: 0, max: 8, opcional: true } as const satisfies DefinicionDePropiedad;

/** `size` relativo al tamano del Tema y `leading` relativo a `size`; sin ellos manda el Slot (`DEFINICION_DE_SLOT`). */
const MEDIDA_DE_TEXTO = {
  size: { tipo: 'numero', min: 0.4, max: 3, opcional: true },
  leading: { tipo: 'numero', min: 1, max: 5, opcional: true },
} as const satisfies Record<string, DefinicionDePropiedad>;

export const TEXTOS = {
  text: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      weight: { tipo: 'numero', min: 100, max: 900, defecto: 400 },
      color: { tipo: 'color', opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], defecto: 'normal' },
      transform: { tipo: 'opcion', valores: ['none', 'uppercase'], defecto: 'none' },
      font: FUENTE,
      alpha: { tipo: 'numero', min: 0, max: 1, opcional: true },
      /** Alineacion del texto dentro de su rectangulo; sin ella manda el Slot (el titulo se centra, el resto empieza a la izquierda). */
      'text-align': { tipo: 'opcion', valores: ['start', 'center', 'end'], opcional: true },
      ...MEDIDA_DE_TEXTO,
      /** En em; tambien ensancha el texto medido. */
      tracking: { tipo: 'numero', min: 0, max: 1, defecto: 0 },
      /** Con `fill` el Slot es un chip: su ancho natural mas `pad` a cada lado. */
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': ANCHO_DE_BORDE,
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 0 },
      /** Punto de color antes del texto; mide un `size` (en em) de ancho. */
      dot: { tipo: 'color', opcional: true },
      /** Texto que se antepone al del Slot (p. ej. `"> "`): se mide y se pinta como parte de el. */
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
      'border-width': ANCHO_DE_BORDE,
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 50 },
      size: MEDIDA_DE_TEXTO.size,
      font: FUENTE,
    },
  },
  icon: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      variant: { tipo: 'opcion', valores: ['plain', 'box', 'dot'], defecto: 'plain' },
      /** En px. */
      side: { tipo: 'numero', min: 6, max: 96, defecto: 16 },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 6 },
      fill: { tipo: 'color', opcional: true },
      /** En `dot`: el punto (4/9 del lado) va sobre un aro de este color. */
      ring: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': ANCHO_DE_BORDE,
      /** Color del glifo; sin el, el color de trazo del Tipo. */
      color: { tipo: 'color', opcional: true },
      /** En px; sin el, en `box` ocupa el 60% del lado. Solo pinta. */
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
      /** Sin `color`, el del texto del Tema. */
      color: { tipo: 'color', opcional: true },
      weight: { tipo: 'numero', min: 100, max: 900, opcional: true },
      font: FUENTE,
      /** Sombra dura desplazada 2 px abajo a la derecha; `rotate` en grados alrededor del centro. */
      shadow: { tipo: 'color', opcional: true },
      rotate: { tipo: 'numero', min: -15, max: 15, opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], opcional: true },
    },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
