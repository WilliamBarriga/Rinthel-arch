/**
 * Zoom semantico: la escala de la camara elige cuanto texto se dibuja. Pura:
 * la misma escala da el mismo nivel; no toca la geometria.
 */
import type { NivelDeDetalle } from 'render';

/** Escalas (lienzo / camara) desde las que se pasa a cada nivel; `etiqueta` es todo lo menor que `titulo`. */
export interface UmbralesDeDetalle {
  /** Desde esta escala se dibuja el titulo. */
  titulo: number;
  /** Desde esta escala se dibujan titulo y Atributos. */
  completo: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesDeDetalle = { titulo: 0.4, completo: 0.8 };

export function nivelDeDetalle(escala: number, umbrales: UmbralesDeDetalle = UMBRALES_POR_DEFECTO): NivelDeDetalle {
  if (escala >= umbrales.completo) return 'completo';
  if (escala >= umbrales.titulo) return 'titulo';
  return 'etiqueta';
}
