/**
 * Familia estilo de texto (ADR 0008): `text` es el estilo de un Slot de Nodo
 * (pinta y, en el titulo, mide: tamano, separacion, mayusculas y chip), `icon` el del Slot `icon` (variante y lado) y `label` es la etiqueta de una Arista con el modelo de caja del
 * Nodo. De las Aristas, solo `label` cuenta en las Metricas (`pad` y `scale`
 * cambian la caja que ELK reserva); `fill`, `border` y `radius` son pintura.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

export const TEXTOS = {
  text: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    // `size`, `tracking`, `transform`, `pad` y `dot` cambian el ancho del titulo medido; el resto es pintura.
    afectaMetricas: true,
    propiedades: {
      weight: { tipo: 'numero', min: 100, max: 900, defecto: 400 },
      color: { tipo: 'color', opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], defecto: 'normal' },
      transform: { tipo: 'opcion', valores: ['none', 'uppercase'], defecto: 'none' },
      /** Tamano respecto al del Tema. Cambia el ancho del texto, asi que entra en las Metricas del Slot `title`. */
      size: { tipo: 'numero', min: 0.5, max: 2, defecto: 1 },
      /** Separacion entre letras, en em; tambien ensancha el texto medido. */
      tracking: { tipo: 'numero', min: 0, max: 1, defecto: 0 },
      /** Opacidad del texto (no la del fondo ni la del borde del chip). */
      alpha: { tipo: 'numero', min: 0, max: 1, defecto: 1 },
      /** Chip: el Slot toma su ancho natural mas `pad` a cada lado y pinta caja con relleno, borde y radio. */
      fill: { tipo: 'color', opcional: true },
      border: { tipo: 'color', opcional: true },
      radius: { tipo: 'numero', min: 0, max: 50, defecto: 0 },
      pad: { tipo: 'numero', min: 0, max: 32, defecto: 0 },
      /** Punto de color antes del texto; mide un `size` (en em) de ancho. */
      dot: { tipo: 'color', opcional: true },
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
