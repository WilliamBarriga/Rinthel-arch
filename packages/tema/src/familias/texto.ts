/**
 * Familia estilo de texto (ADR 0008): `text` es el estilo de un Slot de Nodo
 * (`size` y `leading` cambian el alto que reserva; el resto solo pinta), `chip` el del
 * Slot `counter` (texto en una caja), `icon` el del Slot `icon` (variante y lado) y `label` es la etiqueta de una Arista con el modelo de caja del
 * Nodo. De las Aristas, solo `label` cuenta en las Metricas (`pad` y `scale`
 * cambian la caja que ELK reserva); `fill`, `border` y `radius` son pintura.
 */
import type { DefinicionDePrimitiva, DefinicionDePropiedad } from '../catalogo';

/** Tamano del texto respecto al del Tema y alto de su linea respecto a ese tamano; sin ellos manda el Slot (`DEFINICION_DE_SLOT`). */
/** Familia del texto: la del cuerpo o la mono del Tema; cambia con que fuente se mide. */
const FUENTE = { tipo: 'opcion', valores: ['body', 'mono'], opcional: true } as const satisfies DefinicionDePropiedad;
/** Grosor del borde de la caja de un Slot o de la etiqueta; sin el, 1 px. */
const ANCHO_DE_BORDE = { tipo: 'numero', min: 0, max: 8, opcional: true } as const satisfies DefinicionDePropiedad;

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
      /** Opacidad del texto. */
      alpha: { tipo: 'numero', min: 0, max: 1, opcional: true },
      /** Alineacion del texto dentro de su rectangulo; sin ella manda el Slot (el titulo se centra, el resto empieza a la izquierda). */
      'text-align': { tipo: 'opcion', valores: ['start', 'center', 'end'], opcional: true },
      ...MEDIDA_DE_TEXTO,
      /** Separacion entre letras, en em; tambien ensancha el texto medido. */
      tracking: { tipo: 'numero', min: 0, max: 1, defecto: 0 },
      /** Chip: el Slot toma su ancho natural mas `pad` a cada lado y pinta caja con relleno, borde y radio. */
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': ANCHO_DE_BORDE,
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 0 },
      /** Punto de color antes del texto; mide un `size` (en em) de ancho. */
      dot: { tipo: 'color', opcional: true },
      /** Texto que se antepone al del Slot (p. ej. `"> "`): se mide y se pinta como parte de el. */
      prefix: { tipo: 'texto', largo: 8, opcional: true },
      /** Resplandor del texto (sombra sin desplazamiento); solo pinta. */
      glow: { tipo: 'color', opcional: true },
    },
  },
  /** Estilo del Slot `counter`: un texto en una caja (relleno, borde y radio) que entra en las Metricas por su tamano. */
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
  /** Estilo del Slot `icon` (afecta el lado de su rectangulo, que entra en las Metricas): glifo suelto, en caja o punto de color. */
  icon: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: true,
    propiedades: {
      variant: { tipo: 'opcion', valores: ['plain', 'box', 'dot'], defecto: 'plain' },
      /** Lado del cuadrado del icono, en px. */
      side: { tipo: 'numero', min: 6, max: 96, defecto: 16 },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 6 },
      fill: { tipo: 'color', opcional: true },
      /** En `dot`: el punto (4/9 del lado) va sobre un aro de este color. */
      ring: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': ANCHO_DE_BORDE,
      /** Color del glifo; sin el, el color de trazo del Tipo. */
      color: { tipo: 'color', opcional: true },
      /** Lado del glifo en px, dentro de la caja; sin el, en `box` ocupa el 60% del lado. Solo pinta. */
      glyph: { tipo: 'numero', min: 6, max: 96, opcional: true },
    },
  },
  label: {
    familia: 'texto',
    ubicacion: 'etiqueta',
    afectaMetricas: true,
    propiedades: {
      /** Tamano del texto respecto al del Tema. */
      scale: { tipo: 'numero', min: 0.5, max: 2, defecto: 0.85 },
      /** Margen interior horizontal a cada lado. */
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 4 },
      /** Margen interior vertical a cada lado; agranda la caja que ELK reserva. */
      'pad-y': { tipo: 'numero', min: 0, max: 16, opcional: true },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      'border-width': { tipo: 'numero', min: 0.5, max: 8, opcional: true },
      /** Color y peso del texto (sin `color`, el del texto del Tema). */
      color: { tipo: 'color', opcional: true },
      weight: { tipo: 'numero', min: 100, max: 900, opcional: true },
      font: FUENTE,
      /** Sombra dura de la caja (desplazada 2 px abajo a la derecha) y giro en grados alrededor de su centro. */
      shadow: { tipo: 'color', opcional: true },
      rotate: { tipo: 'numero', min: -15, max: 15, opcional: true },
      /** Cursiva del texto; solo pinta. */
      style: { tipo: 'opcion', valores: ['normal', 'italic'], opcional: true },
    },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
