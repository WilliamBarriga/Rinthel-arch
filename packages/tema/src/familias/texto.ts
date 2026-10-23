/**
 * Familia estilo de texto (ADR 0008): `text` es el estilo de un Slot de Nodo
 * (solo pinta) y `label` es la etiqueta de una Arista con el modelo de caja del
 * Nodo. De las Aristas, solo `label` cuenta en las Metricas (`pad` y `scale`
 * cambian la caja que ELK reserva); `fill`, `border` y `radius` son pintura.
 */
import type { DefinicionDePrimitiva } from '../catalogo';

export const TEXTOS = {
  text: {
    familia: 'texto',
    ubicacion: 'texto-slot',
    afectaMetricas: false,
    propiedades: {
      weight: { tipo: 'numero', min: 100, max: 900, defecto: 400 },
      color: { tipo: 'color', opcional: true },
      style: { tipo: 'opcion', valores: ['normal', 'italic'], defecto: 'normal' },
      transform: { tipo: 'opcion', valores: ['none', 'uppercase'], defecto: 'none' },
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
