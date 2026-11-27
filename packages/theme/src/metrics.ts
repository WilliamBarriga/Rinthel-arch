/**
 * Metrics: Theme spacing and scale that `layout` uses to measure and `render` to draw. They only depend on
 * fonts, text size and Slot layout; paint Layers never change them.
 */
import type { ResolvedNode, Theme } from 'canonical';

import { definitionOf } from './catalog';
import { textWidth } from './measurement';
import type { MetricsMeasurement, TextMeasures } from './measurement';
import type { SlotName } from './catalog';
import type { SlotLayoutBox } from './slot-layout';
import { ROW_TEXT_NAMES } from './row';
import type { RowTextName } from './row';
import { cascade } from './patches';
import type { ResolvedLayer, DiagramType } from './patches';
import { sequenceMetrics } from './sequence';
import type { SequenceMetrics } from './sequence';
import { headerHeight } from './slots';
import { resolveTheme, themeForDiagram } from './theme';
import type { ResolvedTheme } from './theme';

export interface Metrics {
  fontSize: number;
  /** Average character width, relative to the size. */
  factorDeAncho: number;
  /** Part of the layout key. */
  fuentes: Record<string, string>;
  /** Part of the layout key. */
  medicion: MetricsMeasurement;
  /** By `textKey`; absent when estimating. Not part of the key. */
  anchos?: Readonly<Record<string, number>>;
  disposicion: SlotLayoutBox;
  /** What the Theme sets on a text Slot; the rest comes from `SLOT_DEFINITION`. */
  medidaDeTexto: Readonly<Partial<Record<SlotName, { size?: number; leading?: number; mono?: boolean; peso?: number; prefijo?: string; borde?: number }>>>;
  /** `text` style of the `title` Slot that changes its width, besides `size`. */
  titulo: {
    /** In em. */
    tracking: number;
    mayusculas: boolean;
    /** Margin on each side of the chip text, in px. */
    relleno: number;
    borde: number;
    punto: boolean;
    /** With fill or border it is measured at its natural width instead of stretching. */
    caja: boolean;
  };
  /** The Node shape requires a square box (e.g. `circle`). */
  cajaCuadrada: boolean;
  /** `min-width` of the layout root or the core default. */
  anchoMinimo: number;
  /** Slack after the content: `slack` of the layout root or the core default. */
  paddingHorizontal: number;
  /** ER View only: key chips and `?` of the optional ones. */
  marcasDeClave?: true;
  /** ER View, in px; absent, that of the `attrs` Slot (chips, 0.8 of it). */
  tamanoDeFila?: Partial<Record<RowTextName, number>>;
  /** Sequence View only. */
  secuencia?: SequenceMetrics;
  margenDeTexto: number;
  /** Height of the `title` Slot. */
  cabecera: number;
  fila: number;
  /** `top` leaves room for the title. */
  paddingGrupo: { top: number; left: number; bottom: number; right: number };
  /** Side of the `icon` Slot (without `icon` style, the text size) and margin of a Group icon from its border. */
  iconoLado: number;
  /** `variant dot`: shown even if the Node kind declares no icon. */
  iconoEsPunto: boolean;
  margenIcono: number;
  /** From the top border. */
  baseDeTitulo: number;
  margenDeControl: number;
  /** Relative to the Theme text size. */
  escalaEtiqueta: number;
  escalaAtributo: number;
  escalaCardinalidad: number;
  /** `altoDeEtiqueta` is a height/size ratio. */
  holguraDeEtiqueta: number;
  altoDeEtiqueta: number;
  /** `pad-y`, on each side. */
  holguraVerticalDeEtiqueta: number;
  fuenteDeEtiqueta: string;
  /** Without it, the normal one. */
  pesoDeEtiqueta?: number;
}

const DEFAULT_TEXT_SIZE = 14;

/** px; 14 if missing. */
function textSize(fontSize: string | undefined): number {
  const declared = Number.parseFloat(fontSize ?? '');
  return Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_TEXT_SIZE;
}

type SlotStyles = ResolvedTheme['nodo']['textos'];

function titleStyle(texts: SlotStyles): Metrics['titulo'] {
  const props = texts.title?.props ?? {};
  return {
    tracking: Number(props['tracking'] ?? 0),
    mayusculas: props['transform'] === 'uppercase',
    relleno: Number(props['pad'] ?? 0),
    borde: props['border'] === undefined ? 0 : Number(props['border-width'] ?? 1),
    punto: props['dot'] !== undefined,
    caja: props['fill'] !== undefined || props['border'] !== undefined,
  };
}

function entryOf(resolved: ResolvedTheme, stack: readonly ResolvedLayer[], measures: TextMeasures | undefined, { slots, textos: texts }: { slots: SlotLayoutBox; textos: SlotStyles } = resolved.nodo): Metrics {
  const fontSize = textSize(resolved.tokens.fontSize);
  const label = resolved.arista.etiqueta?.props as { scale?: number; pad?: number; 'pad-y'?: number; font?: string; weight?: number } | undefined;
  const proportional = !/mono/i.test(resolved.fonts.body);
  return {
    fontSize,
    factorDeAncho: proportional ? 0.55 : 0.6,
    fuentes: resolved.fonts,
    medicion: measures === undefined ? { nivel: 'estimado', fuentes: {} } : { nivel: 'medido', fuentes: measures.fuentes },
    ...(measures !== undefined && { anchos: measures.anchos }),
    disposicion: slots,
    medidaDeTexto: Object.fromEntries(
      Object.entries(texts).flatMap(([slot, text]) => {
        const { size, leading, font, weight, prefix, border } = text.props as { size?: number; leading?: number; font?: string; weight?: number; prefix?: string; border?: string };
        const mono = font === 'mono';
        const nonDefaultWeight = weight === undefined || weight === 400 ? undefined : weight;
        // The title's already counts the border in `titulo.borde`.
        const chipBorder = text.tipo === 'chip' && border !== undefined ? Number(text.props['border-width'] ?? 1) : undefined;
        const measure = {
          ...(size !== undefined && { size }),
          ...(leading !== undefined && { leading }),
          ...(mono && { mono }),
          ...(nonDefaultWeight !== undefined && { peso: nonDefaultWeight }),
          ...(prefix !== undefined && prefix !== '' && { prefijo: prefix }),
          ...(chipBorder !== undefined && chipBorder > 0 && { borde: chipBorder }),
        };
        return Object.keys(measure).length === 0 ? [] : [[slot, measure]];
      }),
    ),
    cajaCuadrada: stack.some((layer) => definitionOf(layer.primitiva.tipo).minimumBox === 'square'),
    anchoMinimo: slots.anchoMinimo ?? 120,
    paddingHorizontal: slots.holgura ?? 32,
    margenDeTexto: 10,
    cabecera: Math.ceil(fontSize * 3.4),
    fila: Math.ceil(fontSize * 1.8),
    paddingGrupo: { top: 32, left: 16, bottom: 16, right: 16 },
    iconoLado: Number(texts.icon?.props['side'] ?? fontSize),
    iconoEsPunto: texts.icon?.props['variant'] === 'dot',
    margenIcono: 6,
    baseDeTitulo: fontSize + 8,
    margenDeControl: 12,
    titulo: titleStyle(texts),
    escalaEtiqueta: label?.scale ?? 0.85,
    escalaAtributo: 0.85,
    escalaCardinalidad: 0.8,
    holguraDeEtiqueta: 2 * (label?.pad ?? 4),
    altoDeEtiqueta: 1.4,
    holguraVerticalDeEtiqueta: 2 * (label?.['pad-y'] ?? 0),
    fuenteDeEtiqueta: label?.font === 'mono' ? resolved.fonts.mono : resolved.fonts.body,
    ...(label?.weight !== undefined && label.weight !== 400 && { pesoDeEtiqueta: label.weight }),
  };
}

/** `tipos` only holds the Node kinds whose Metrics differ from `base`. Does not depend on states or paint. */
export interface MetricsTable {
  base: Metrics;
  tipos: Record<string, Metrics>;
  grupoAbierto: Metrics;
  grupoColapsado: Metrics;
  etiqueta: Metrics;
}

/** Row height per text px when the Theme sets `size` without `height`. */
const ROW_LINE_SPACING = 1.4;

function rowSizes(texts: NonNullable<ResolvedTheme['fila']>['textos'] | undefined, fontSize: number): Partial<Record<RowTextName, number>> {
  const output: Partial<Record<RowTextName, number>> = {};
  for (const name of ROW_TEXT_NAMES) {
    const size = texts?.[name]?.props['size'];
    if (typeof size === 'number') output[name] = fontSize * size;
  }
  return output;
}

export function metricsTable(theme: Theme, diagram: DiagramType | undefined, measures?: TextMeasures): MetricsTable {
  const table = tableWithoutMarks(theme, diagram, measures);
  if (diagram === 'sequence') {
    const sequence = sequenceMetrics(resolveTheme(theme).secuencia);
    const withSequence = (m: Metrics): Metrics => ({ ...m, secuencia: sequence });
    return { base: withSequence(table.base), tipos: Object.fromEntries(Object.entries(table.tipos).map(([kind, m]) => [kind, withSequence(m)])), grupoAbierto: withSequence(table.grupoAbierto), grupoColapsado: withSequence(table.grupoColapsado), etiqueta: withSequence(table.etiqueta) };
  }
  if (diagram !== 'er') return table;
  const row = resolveTheme(theme).fila;
  const withMarks = (m: Metrics): Metrics => {
    const size = rowSizes(row?.textos, m.fontSize);
    const largest = Math.max(0, ...Object.values(size));
    const height = row?.alto ?? (largest > 0 ? Math.max(m.fila, Math.ceil(largest * ROW_LINE_SPACING)) : undefined);
    return { ...m, ...(height !== undefined && { fila: height }), ...(Object.keys(size).length > 0 && { tamanoDeFila: size }), marcasDeClave: true };
  };
  return { base: withMarks(table.base), tipos: Object.fromEntries(Object.entries(table.tipos).map(([kind, m]) => [kind, withMarks(m)])), grupoAbierto: withMarks(table.grupoAbierto), grupoColapsado: withMarks(table.grupoColapsado), etiqueta: withMarks(table.etiqueta) };
}

function tableWithoutMarks(theme: Theme, diagram: DiagramType | undefined, measures?: TextMeasures): MetricsTable {
  const resolved = themeForDiagram(resolveTheme(theme), diagram);
  const base = entryOf(resolved, cascade(resolved), measures);
  const baseKey = JSON.stringify(base);
  const kinds: Record<string, Metrics> = {};
  for (const kind of Object.keys(resolved.nodo.tipos).sort()) {
    const entry = entryOf(resolved, cascade(resolved, { tipo: kind }), measures);
    if (JSON.stringify(entry) !== baseKey) kinds[kind] = entry;
  }
  return { base, tipos: kinds, grupoAbierto: groupEntry(resolved, false, measures), grupoColapsado: groupEntry(resolved, true, measures), etiqueta: base };
}

/**
 * Open: the top padding adds the header height, so children never touch it. Collapsed: a leaf with
 * the Node Slots and styles except what `collapsed` changes.
 */
function groupEntry(resolved: ResolvedTheme, collapsed: boolean, measures?: TextMeasures): Metrics {
  const { grupo: group } = resolved;
  const texts = collapsed ? { ...resolved.nodo.textos, ...group.colapsado.textos } : group.textos;
  const slots = collapsed ? (group.colapsado.slots ?? resolved.nodo.slots) : group.slots;
  const entry = entryOf(resolved, cascade(resolved, { colapsado: collapsed }, 'grupo'), measures, { slots, textos: texts });
  if (collapsed) return entry;
  const titleScale = entry.medidaDeTexto.title?.size ?? 1;
  const open = { ...entry, cajaCuadrada: false, anchoMinimo: 0, paddingHorizontal: 2 * entry.margenDeControl, cabecera: Math.ceil(entry.fontSize * titleScale * 1.7) };
  const { top, left, bottom, right } = group.padding;
  return { ...open, paddingGrupo: { top: headerHeight(open) + top, left, bottom, right } };
}

/** Base entry of the table: Node without a Node kind. */
export function metricsOf(theme: Theme, diagram: DiagramType | undefined): Metrics {
  return metricsTable(theme, diagram).base;
}

/** The base if the Theme gives the Node kind no box of its own. */
export function nodeMetricsFor(table: MetricsTable, kind?: string): Metrics {
  return kind !== undefined && Object.hasOwn(table.tipos, kind) ? table.tipos[kind]! : table.base;
}

/** Collapsed group or leaf Node of its Node kind. */
export function leafMetrics(table: MetricsTable, node: Pick<ResolvedNode, 'type' | 'collapsed'>): Metrics {
  return node.collapsed ? table.grupoColapsado : nodeMetricsFor(table, node.type);
}

export function uniformTable(metrics: Metrics): MetricsTable {
  return { base: metrics, tipos: {}, grupoAbierto: metrics, grupoColapsado: metrics, etiqueta: metrics };
}

export const asTable = (m: Metrics | MetricsTable): MetricsTable => ('grupoAbierto' in m ? m : uniformTable(m));

/** Equal if and only if no element changes its box. */
export function metricsKey(table: MetricsTable): string {
  return JSON.stringify(table, (key, value: unknown) => (key === 'anchos' ? undefined : value));
}

export function labelSize(text: string, metrics: Metrics): { width: number; height: number } {
  const size = metrics.fontSize * metrics.escalaEtiqueta;
  return {
    width: Math.ceil(textWidth(metrics, metrics.fuenteDeEtiqueta, size, text, metrics.pesoDeEtiqueta)) + metrics.holguraDeEtiqueta,
    height: Math.ceil(size * metrics.altoDeEtiqueta) + metrics.holguraVerticalDeEtiqueta,
  };
}

/** px. Minimum final segment of an ER Edge into a table and default crow's foot size. */
export const ER_MARKER_LENGTH = 12;

export const guardText = (guard: string): string => `[${guard}]`;

/** px; longer text wraps by words. */
export const NOTE_MAX_WIDTH = 200;
/** Padding and folded corner of a Note, in px. */
export const NOTE_PADDING = 8;
export const NOTE_CORNER = 10;

/** Includes the space: it is what `noteBox` measures. */
export function noteWords(text: string): string[] {
  return [...new Set([' ', ...text.split(/\s+/).filter((word) => word !== '')])];
}

/** The label one, without the scale. */
export function noteTextStyle(metrics: Metrics): { familia: string; tamano: number; peso?: number } {
  return { familia: metrics.fuenteDeEtiqueta, tamano: metrics.fontSize, ...(metrics.pesoDeEtiqueta !== undefined && { peso: metrics.pesoDeEtiqueta }) };
}

/** Text wrapped by words at `NOTE_MAX_WIDTH`, plus padding and folded corner. */
export function noteBox(text: string, metrics: Metrics): { width: number; height: number; lines: string[]; lineHeight: number } {
  const { familia: family, tamano: size, peso: nonDefaultWeight } = noteTextStyle(metrics);
  const width = (t: string): number => textWidth(metrics, family, size, t, nonDefaultWeight);
  const space = width(' ');
  const lines: { texto: string; ancho: number }[] = [];
  for (const word of text.split(/\s+/).filter((p) => p !== '')) {
    const w = width(word);
    const last = lines.at(-1);
    if (last !== undefined && last.ancho + space + w <= NOTE_MAX_WIDTH) {
      last.texto += ` ${word}`;
      last.ancho += space + w;
    } else {
      lines.push({ texto: word, ancho: w });
    }
  }
  if (lines.length === 0) lines.push({ texto: '', ancho: 0 });
  const lineHeight = Math.ceil(size * metrics.altoDeEtiqueta);
  return {
    width: Math.ceil(Math.max(...lines.map((l) => l.ancho))) + 2 * NOTE_PADDING + NOTE_CORNER / 2,
    height: lines.length * lineHeight + 2 * NOTE_PADDING,
    lines: lines.map((l) => l.texto),
    lineHeight,
  };
}
