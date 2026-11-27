/** Semantic zoom: the camera scale chooses how much text is drawn; it does not touch the geometry. */
import type { DetailLevel } from 'render';

/** Scales (canvas / camera) from which each level applies; `etiqueta` is everything below `title`. */
export interface DetailThresholds {
  /** From this scale the title is drawn. */
  title: number;
  /** From this scale title and Attributes are drawn. */
  full: number;
}

export const DEFAULT_THRESHOLDS: DetailThresholds = { title: 0.4, full: 0.8 };

export function detailLevel(scale: number, thresholds: DetailThresholds = DEFAULT_THRESHOLDS): DetailLevel {
  if (scale >= thresholds.full) return 'completo';
  if (scale >= thresholds.title) return 'titulo';
  return 'etiqueta';
}
