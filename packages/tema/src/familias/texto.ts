/**
 * Familia estilo de texto (ADR 0008): `text` es el estilo de un Slot de Nodo
 * (`size` y `leading` cambian el alto que reserva; el resto solo pinta), `chip` el del
 * Slot `counter` (texto en una caja), `icon` el del Slot `icon` (variante y lado) y `label` es la etiqueta de una Arista con el modelo de caja del
 * Nodo. De las Aristas, solo `label` cuenta en las Metricas (`pad` y `scale`
 * cambian la caja que ELK reserva); `fill`, `border` y `radius` son pintura.
 */
import type { DefinicionDePrimitiva, DefinicionDePropiedad } from '../catalogo';

/** Tamano del texto respecto al del Tema y alto de su linea respecto a ese tamano; sin ellos manda el Slot (`DEFINICION_DE_SLOT`). */
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
      /** Opacidad del texto. */
      alpha: { tipo: 'numero', min: 0, max: 1, opcional: true },
      /** Alineacion del texto dentro de su rectangulo; sin ella manda el Slot (el titulo se centra, el resto empieza a la izquierda). */
      'text-align': { tipo: 'opcion', valores: ['start', 'center', 'end'], opcional: true },
      ...MEDIDA_DE_TEXTO,
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
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 50 },
      size: MEDIDA_DE_TEXTO.size,
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
      border: { tipo: 'color', opcional: true },
      /** Color del glifo; sin el, el color de trazo del Tipo. */
      color: { tipo: 'color', opcional: true },
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
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
    },
  },
} as const satisfies Record<string, DefinicionDePrimitiva>;
