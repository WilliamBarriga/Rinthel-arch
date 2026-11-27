/**
 * `theme` (ADR 0008): catalog of Primitives and Slots, schema of the resolved Theme,
 * Resolved style (`resolvedStyle` -> Metrics and paint), Slot placement,
 * patch cascade, animation, color, contrast and text measuring.
 * Invariants: pure and deterministic (no I/O, clock, randomness or DOM); the Metrics depend only
 * on fonts, text size and Slot layout, never on paint, animation or `code`.
 * Errors: invalid data is returned as errors, all at once; only `resolveTheme` throws.
 * Dependencies: only `canonical`.
 */
export { CATALOG, SLOT_DEFINITION, SLOTS, TEXT_SLOTS, buildPrimitive, primitivesOf, primitivesOfFamily, resolveTokens, suggest, validateProperties } from './catalog';
export { ALIGNMENTS, DEFAULT_HEADER, DIRECTIONS, DEFAULT_LAYOUT, NODE_ONLY_SLOTS, alignmentOf, buildLayout, describeLayout, isBox, slotsOf } from './slot-layout';
export type { Alignment, SlotLayoutBox, Direction, SlotLayoutElement, BoxInput, SlotInput, LayoutError, SlotLayoutLeaf, WrittenProperty } from './slot-layout';
export type { PrimitiveDefinition, PropertyDefinition, CatalogError, PrimitiveName, PrimitiveNameAt, SlotName, TextSlotName, Primitive, PrimitivePlacement } from './catalog';
export { createPrng, fnv1a, layerSpin, layerSeed } from './seed';
export { DEFAULT_GROUP, NEUTRAL_THEME, readOps, resolveTheme, themeForDiagram, resolvedThemeSchema } from './theme';
export type { ResolvedTheme } from './theme';
export { chipsWidth, visibleAttributes, keyChips, nodeContent, sample, attributePieces, attributeText } from './content';
export type { KeyChip } from './content';
export type { NodeContent } from './content';
export { NOTE_MAX_WIDTH, NOTE_CORNER, ER_MARKER_LENGTH, NOTE_PADDING, noteBox, noteTextStyle, noteWords, metricsKey, asTable, metricsOf, leafMetrics, nodeMetricsFor, metricsTable, uniformTable, labelSize, guardText } from './metrics';
export type { Metrics, MetricsTable } from './metrics';
export { textWidth, textKey, fontHash } from './measurement';
export type { MetricsMeasurement, TextMeasures, TextToMeasure } from './measurement';
export { textsToMeasure } from './texts-to-measure';
export { fontsWithoutFallback, fontStack, resolveFonts } from './fonts';
export type { FontFace, MissingFont } from './fonts';
export { catalogReference } from './reference';
export { TITLE_DOT_EM, headerHeight, placeLayout, placeInBox, placeNode, measureLayout, slotText } from './slots';
export type { NodePlacement, SlotMeasure, Rect, Size } from './slots';
export { resolvedStyle, rowStack } from './style';
export { ROW_HEIGHT, ROW_KEYS, ROW_TEXT_NAMES, ROW_TEXTS, rowKey } from './row';
export type { RowTextName, RowVariant } from './row';
export { paintedPrimitive } from './style';
export type { NodeAnimation, PaintedLayer, ResolvedStyle, ResolvedFonts, StyleOptions, Paint, ActivationPaint, EdgePaint, SequenceBoxPaint, ElementPaint, RowPaint, FragmentPaint, NodePaint, NotePaint, PagePaint, SequencePaint, SequenceStrokePaint, PaintedPrimitive, VariantStroke, SequenceStrokes } from './style';
export { erEdgeLayers } from './messages';
export { themeElements } from './elements';
export type { DescribedLayer, DescribedElement, DescribedElements } from './elements';
export { SEQUENCE_BLOCKS, SEQUENCE_SPEC, sequenceMetrics } from './sequence';
export type { SequenceBlock, BlockSpec, BlockMetric, SequenceMetrics } from './sequence';
export { applyOps, cascade, STATES, DIAGRAM_TYPES, opTouchesMetrics, parseState, validateOps } from './patches';
export type { ResolvedLayer, ThemeElement, OpError, State, PatchMode, LayerOp, StateResult, DiagramType } from './patches';
export { resolveColor, validateColor } from './color';
export type { ColorContext, ColorError } from './color';
export { contrastWarnings, identifyingEdgeColorOnly, themeLegend, colorOnlyMessages, contrastRatio, colorOnlyKinds } from './contrast';
export type { ContrastWarning, LegendEntry, Legend, LegendKind } from './contrast';
export { HIGH_CONTRAST_THEME } from './high-contrast';
export { themeComponents, codeUses } from './code';
export type { ComponentUse } from './code';
export { EASINGS, EFFECTS, MOTIONS, ANIMATABLE_PROPERTIES, buildEffect, buildStagger, buildKeyframes, buildMotion, buildTransition, durationMs } from './animation';
export type { Animation, Easing, Effect, LayerKeyframes, Motion, EffectName, MotionName, AnimationParameter, KeyframesStep, AnimatableProperty, Reduced, Transition } from './animation';
