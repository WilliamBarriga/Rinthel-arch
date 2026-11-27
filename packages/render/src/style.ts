/**
 * Resolved Style: everything drawing needs about looks (colors, fonts, radii, strokes, halo, glyphs and the
 * Metrics shared with `layout`). `resolveStyle` is the only place with drawing defaults and numbers. Pure.
 */
import type { Theme } from 'canonical';
import { resolvedStyle, resolveTheme, uniformTable } from 'theme';
import type { FontFace, State, TextMeasures, Metrics, Paint, MetricsTable, DiagramType } from 'theme';

export type VisualState = State;

/** Minimum width (px) of the focus ring: no Style removes it. */
export const MIN_FOCUS_RING = 2;

/**
 * Outline of a state: color, width, optional dashed stroke and opacity. In `dimmed` only `opacity` counts: the
 * whole element's. In `planned` (the default Theme look for what is Planned, inherited by every Theme without its own
 * patch for the state) `opacity` is also the whole element's, the dashed outline surrounds the box from outside and
 * `stroke` also dashes the lines of Edges, Messages and Lifelines.
 */
export interface StateLook {
  color: string;
  width: number;
  stroke?: string;
  opacity: number;
}

export interface Style {
  /** Base entry of the Metrics (Node without kind); for a concrete Node, `leafMetrics(table, kind)`. */
  metrics: Metrics;
  /** Per-element Metrics drawing uses; they must be the layout's. */
  table: MetricsTable;
  /** Theme paint: the Layer stack of each element, with colors already resolved. */
  paint: Paint;
  background: string;
  text: string;
  border: string;
  bodyFont: string;
  monoFont: string;
  /** Workspace font faces the Theme uses (`@font-face`); empty if the consumer gave no files. */
  faces: FontFace[];
  /** Color of the chrome's error notices: the Theme's `error` token or, if missing, a default red. */
  errorColor: string;
  /** Palette name -> value. */
  palette: Record<string, string>;
  node: {
    radius: number;
    fill: string;
    /** `stroke-dasharray` of a collapsed Group. */
    collapsedStroke: string;
  };
  edge: {
    /** Gap between the cardinality and the endpoint. */
    cardinalityGap: number;
    /** How much the cardinality of a horizontal segment is raised so it does not overlap the line. */
    cardinalityLift: number;
    /** How much the label is raised over the segment when it has no box of its own. */
    boxlessLabelLift: number;
  };
  label: {
    /** Halo of the background color to read over the lines. */
    halo: { color: string; width: number };
    /** Fraction of the text size that lowers the baseline to center in the box. */
    verticalCentering: number;
  };
  /** Outline of each visual state; drawn with the same painters as the rest. */
  states: Record<VisualState, StateLook>;
  glyphs: { expandedGlyph: string; collapsedGlyph: string };
}

/**
 * Resolved Style of the Theme. Throws if the Theme does not satisfy the contract (`resolveTheme`),
 * with a message naming each missing path. `metrics` replaces the ones derived from the Theme; `measures`
 * are the real text measures the Geometry was computed with (the drawing Metrics come from them).
 */
export function resolveStyle(theme: Theme, diagram: DiagramType, metrics?: Metrics, fontFiles?: readonly string[], measures?: TextMeasures): Style {
  const { tokens, palette } = resolveTheme(theme);
  const accent = palette['blue'] ?? tokens.foreground;
  // A Layer's `COLOR` is the `--trazo` variable each Node and Group sets to its color: one sheet serves every color.
  const resolved = resolvedStyle(theme, { diagrama: diagram, colorEnVariable: '--trazo', ...(fontFiles !== undefined && { archivosDeFuente: fontFiles }), ...(measures !== undefined && { medidas: measures }) });
  const table = metrics === undefined ? resolved.tabla : uniformTable(metrics);
  return {
    metrics: table.base,
    table: table,
    paint: resolved.pintura,
    background: tokens.background,
    text: tokens.foreground,
    border: tokens.border,
    bodyFont: resolved.fuentes.cuerpo,
    monoFont: resolved.fuentes.mono,
    faces: resolved.fuentes.caras,
    errorColor: tokens['error'] ?? DEFAULT_ERROR_COLOR,
    palette: palette,
    node: { radius: 6, fill: tokens.background, collapsedStroke: '6 3' },
    edge: {
      cardinalityGap: 8,
      cardinalityLift: 4,
      boxlessLabelLift: 4,
    },
    label: { halo: { color: tokens.background, width: 3 }, verticalCentering: 0.35 },
    states: {
      planned: { color: tokens.border, width: 1.5, stroke: '5 4', opacity: 0.55 },
      selected: { color: accent, width: 3, opacity: 1 },
      hover: { color: accent, width: 2, opacity: 0.6 },
      ghost: { color: tokens.border, width: 2, stroke: '4 3', opacity: 0.7 },
      'on-path': { color: accent, width: 3, opacity: 1 },
      dimmed: { color: tokens.border, width: 0, opacity: 0.3 },
      focus: { color: accent, width: 3, opacity: 1 },
    },
    glyphs: { expandedGlyph: '-', collapsedGlyph: '+' },
  };
}

/** Look of a state as drawn: the focus ring never goes below the minimum nor is invisible. */
export function stateLook(style: Style, state: VisualState): StateLook {
  const look = style.states[state];
  if (state !== 'focus') return look;
  return { ...look, width: Math.max(look.width, MIN_FOCUS_RING), opacity: 1 };
}

const DEFAULT_ERROR_COLOR = '#dc2626';
