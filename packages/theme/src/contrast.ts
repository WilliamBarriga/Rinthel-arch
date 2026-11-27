/** Theme accessibility: contrast per Node kind and state, color-only distinctions and the derived legend. Computes only. */
import type { Theme, MessageKind } from 'canonical';

import { CATALOG, definitionOf, primitivesOfFamily } from './catalog';
import type { PropertyDefinition, PrimitiveName } from './catalog';
import { hexToRgb } from './color';
import { resolvedStyle } from './style';
import { erEdgeLayers } from './messages';
import { sample } from './content';
import { resolveTheme } from './theme';
import type { PaintedLayer, PaintedPrimitive } from './style';
import type { State, DiagramType } from './patches';

type Rgb = readonly [number, number, number];

/** WCAG minimums: normal text and graphic parts. */
export const MIN_TEXT = 4.5;
export const MIN_GRAPHIC = 3;

function readColor(text: string): { rgb: Rgb; alfa: number } | undefined {
  const hex = hexToRgb(text);
  if (hex !== undefined) return { rgb: hex, alfa: 1 };
  const m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(text);
  return m === null ? undefined : { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alfa: Number(m[4]) };
}

/** A translucent color is composited over `background`. */
function opaque(text: string, background: Rgb): Rgb | undefined {
  const color = readColor(text);
  if (color === undefined) return undefined;
  return color.rgb.map((c, i) => c * color.alfa + (background[i] as number) * (1 - color.alfa)) as unknown as Rgb;
}

const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: Rgb, b: Rgb): number => {
  const [lumA, lumB] = [luminance(a), luminance(b)];
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
};

/** WCAG ratio between hex or `rgba(...)` colors (composited over white); `undefined` if either cannot be parsed. */
export function contrastRatio(a: string, b: string): number | undefined {
  const [ca, cb] = [opaque(a, [255, 255, 255]), opaque(b, [255, 255, 255])];
  return ca === undefined || cb === undefined ? undefined : ratio(ca, cb);
}

export interface ContrastWarning {
  tipo: string;
  estado: 'base' | State;
  parte: 'texto' | 'grafico';
  /** Layer that sets the evaluated color. */
  capa: string;
  razon: number;
  minimo: number;
  mensaje: string;
}

const last = (stack: readonly PaintedLayer[], kinds: readonly PrimitiveName[]): PaintedLayer | undefined =>
  [...stack].reverse().find((layer) => kinds.includes(layer.tipo));

function evaluate(stack: readonly PaintedLayer[], background: Rgb, text: Rgb): Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> {
  const results: Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> = [];
  const fill = [...stack].reverse().find((layer) => definitionOf(layer.tipo).fondoDeTexto !== undefined);
  const colors = fill === undefined ? [] : (definitionOf(fill.tipo).fondoDeTexto ?? []).map((k) => String(fill.props[k]));
  const backgrounds = colors.map((c) => ({ c, rgb: opaque(c, background) })).filter((x): x is { c: string; rgb: Rgb } => x.rgb !== undefined);
  if (fill !== undefined && backgrounds.length > 0) {
    const worst = backgrounds.map((f) => ({ ...f, r: ratio(text, f.rgb) })).sort((a, b) => a.r - b.r)[0]!;
    results.push({ parte: 'texto', capa: fill.nombre, razon: worst.r, color: worst.c });
  } else results.push({ parte: 'texto', capa: 'tokens', razon: ratio(text, background), color: 'fondo' });
  const border = last(stack, primitivesOfFamily('borde'));
  const stroke = border === undefined ? undefined : opaque(String(border.props['color']), background);
  if (border !== undefined && stroke !== undefined) results.push({ parte: 'grafico', capa: border.nombre, razon: ratio(stroke, background), color: String(border.props['color']) });
  return results;
}

/**
 * Text (`tokens.foreground`) against the fill (4.5:1) and border against the page background (3:1), per Node kind and state.
 * A state only warns if it is worse than the base. Ignores the Diagram type patches.
 */
export function contrastWarnings(theme: Theme, kinds: Readonly<Record<string, string | undefined>>): ContrastWarning[] {
  const style = resolvedStyle(theme, { diagrama: undefined, tipos: kinds });
  const background = hexToRgb(resolveTheme(theme).tokens.background) ?? ([255, 255, 255] as const);
  const text = hexToRgb(resolveTheme(theme).tokens.foreground) ?? ([0, 0, 0] as const);
  const notices: ContrastWarning[] = [];
  for (const [kind, paint] of Object.entries(style.pintura.nodo.tipos)) {
    const base = evaluate(paint.capas, background, text);
    const stacks: Array<['base' | State, readonly PaintedLayer[]]> = [['base', paint.capas], ...(Object.entries(paint.estados) as Array<[State, PaintedLayer[]]>)];
    for (const [state, stack] of stacks) {
      for (const r of state === 'base' ? base : evaluate(stack, background, text)) {
        const minimum = r.parte === 'texto' ? MIN_TEXT : MIN_GRAPHIC;
        if (r.razon >= minimum) continue;
        if (state !== 'base' && base.some((b) => b.parte === r.parte && Math.abs(b.razon - r.razon) < 1e-9)) continue;
        const subjectText = r.parte === 'texto' ? 'The text' : 'The border';
        notices.push({
          tipo: kind,
          estado: state,
          parte: r.parte,
          capa: r.capa,
          razon: r.razon,
          minimo: minimum,
          mensaje: `${subjectText} of kind '${kind}' (state ${state}) has contrast ${r.razon.toFixed(2)}:1 with ${r.color}; the minimum is ${minimum}:1`,
        });
      }
    }
  }
  return notices;
}

export interface LegendKind {
  name: string;
  color?: string | undefined;
  icon?: string | undefined;
}

const removeColor = (layer: PaintedLayer) => ({
  nombre: layer.nombre,
  tipo: layer.tipo,
  props: Object.fromEntries(Object.entries(layer.props).filter(([k]) => (CATALOG[layer.tipo].propiedades as Record<string, PropertyDefinition | undefined>)[k]?.tipo !== 'color')),
  encima: layer.encima ?? false,
});

/**
 * Pairs of Node kinds with the same stack without colors (at rest and in each state) and the same icon, but different colors;
 * in declaration order. If the Node shows `badge` there are none. `diagram` `undefined`: without diagram patches.
 */
export function colorOnlyKinds(theme: Theme, diagram: DiagramType | undefined, kinds: readonly LegendKind[]): Array<[string, string]> {
  const style = resolvedStyle(theme, { diagrama: diagram, tipos: Object.fromEntries(kinds.map((t) => [t.name, t.color])) });
  if (sample(style.metricas, 'badge')) return [];
  const signature = (t: LegendKind) => {
    const p = style.pintura.nodo.tipos[t.name]!;
    const stacks = [p.capas, ...Object.entries(p.estados).sort(([a], [b]) => a.localeCompare(b)).map(([, stack]) => stack!)];
    return { estructura: JSON.stringify([t.icon ?? null, stacks.map((stack) => stack.map(removeColor))]), completa: JSON.stringify([stacks]) };
  };
  const signatures = kinds.map(signature);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      if (signatures[i]!.estructura === signatures[j]!.estructura && signatures[i]!.completa !== signatures[j]!.completa) pairs.push([kinds[i]!.name, kinds[j]!.name]);
    }
  }
  return pairs;
}

const removeMarkerColor = (marker: PaintedPrimitive | undefined) => (marker === undefined ? null : removeColor({ nombre: '', tipo: marker.tipo, props: marker.props }));

function colorOnlyPairs<T extends string>(names: readonly T[], paint: (name: T) => { capas: readonly PaintedLayer[]; origen?: PaintedPrimitive | undefined; fin?: PaintedPrimitive | undefined }): Array<[T, T]> {
  const signatures = names.map((name) => {
    const { capas: layers, origen: origin, fin: end } = paint(name);
    return { estructura: JSON.stringify([layers.map(removeColor), removeMarkerColor(origin), removeMarkerColor(end)]), completa: JSON.stringify([layers, origin ?? null, end ?? null]) };
  });
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (signatures[i]!.estructura === signatures[j]!.estructura && signatures[i]!.completa !== signatures[j]!.completa) pairs.push([names[i]!, names[j]!]);
    }
  }
  return pairs;
}

/** Only among the given `kinds`, in their order. */
export function colorOnlyMessages(theme: Theme, kinds: readonly MessageKind[]): Array<[MessageKind, MessageKind]> {
  const style = resolvedStyle(theme, { diagrama: 'sequence' });
  const { tipos: byKind } = style.pintura.secuencia!.mensaje.base;
  return colorOnlyPairs(kinds, (kind) => byKind[kind]!);
}

export function identifyingEdgeColorOnly(theme: Theme): boolean {
  const { arista: edge } = resolvedStyle(theme, { diagrama: 'er' }).pintura;
  return colorOnlyPairs(['identificante', 'no-identificante'] as const, (name) => ({ capas: erEdgeLayers(edge, name === 'identificante') })).length > 0;
}

export interface LegendEntry {
  tipo: string;
  /** `rect` if the Node kind declares no other. */
  forma: string;
  /** Palette value. */
  color: string | undefined;
}

export interface Legend {
  entradas: LegendEntry[];
  /** Some Node kinds differ only by color. */
  necesaria: boolean;
}

export function themeLegend(theme: Theme, diagram: DiagramType | undefined, kinds: readonly LegendKind[]): Legend {
  const style = resolvedStyle(theme, { diagrama: diagram, tipos: Object.fromEntries(kinds.map((t) => [t.name, t.color])) });
  const palette = resolveTheme(theme).palette;
  return {
    necesaria: colorOnlyKinds(theme, diagram, kinds).length > 0,
    entradas: kinds.map((t) => ({
      tipo: t.name,
      forma: last(style.pintura.nodo.tipos[t.name]!.capas, primitivesOfFamily('forma'))?.tipo ?? 'rect',
      color: t.color === undefined ? undefined : Object.hasOwn(palette, t.color) ? palette[t.color] : undefined,
    })),
  };
}
