/**
 * Umbrales y margenes de la interaccion del shell como configuracion: los
 * valores por defecto viven aqui y `VistaInteractiva` los acepta parciales por
 * la prop `tuning`.
 */
export interface AjustesDeInteraccion {
  /** Distancia en px de pantalla desde la que un arrastre de Nodo deja de ser un clic. */
  dragThreshold: number;
  /** Distancia en px de pantalla a la que un clic acierta una Arista. */
  hitTolerance: number;
  /** Escala minima de la camara. */
  minScale: number;
  /** Escala maxima de la camara. */
  maxScale: number;
  /** Margen en unidades de la geometria alrededor de la Vista al encuadrar. */
  fitMargin: number;
}

export const AJUSTES_POR_DEFECTO: Readonly<AjustesDeInteraccion> = {
  dragThreshold: 3,
  hitTolerance: 4,
  minScale: 0.05,
  maxScale: 16,
  fitMargin: 24,
};
