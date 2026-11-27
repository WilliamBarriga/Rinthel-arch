/** Interaction thresholds and margins; `InteractiveView` accepts them partially through `tuning`. */
export interface InteractionSettings {
  /** Distance in screen px from which a Node drag stops being a click. */
  dragThreshold: number;
  /** Distance in screen px at which a click hits an Edge. */
  hitTolerance: number;
  /** Minimum camera scale. */
  minScale: number;
  /** Maximum camera scale. */
  maxScale: number;
  /** Margin in geometry units around the View when framing. */
  fitMargin: number;
}

export const DEFAULT_SETTINGS: Readonly<InteractionSettings> = {
  dragThreshold: 3,
  hitTolerance: 4,
  minScale: 0.05,
  maxScale: 16,
  fitMargin: 24,
};
