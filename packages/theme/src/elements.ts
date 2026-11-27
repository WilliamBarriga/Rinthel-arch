/**
 * Sequence and ER Theme elements, described (`inspect theme`). A declared one comes out as the Theme writes it
 * (colors as Palette names); an undeclared one only comes out in its Diagram type, derived and marked `derivado`.
 */
import type { Theme } from 'canonical';

import { resolvedStyle } from './style';
import type { PaintedLayer, ActivationPaint, SequenceBoxPaint, SequencePaint, PaintedPrimitive, SequenceStrokes } from './style';
import { applyOps } from './patches';
import type { ResolvedLayer, DiagramType } from './patches';
import { SEQUENCE_BLOCKS, SEQUENCE_SPEC } from './sequence';
import type { SequenceBlock } from './sequence';
import { resolveTheme, themeForDiagram } from './theme';

export interface DescribedLayer {
  nombre: string;
  primitiva: string;
  props: Record<string, number | string>;
  encima: boolean;
  animada: boolean;
}

export interface DescribedElement {
  capas: DescribedLayer[];
  marcadores: Partial<Record<'start' | 'end', string>>;
  parches: Record<string, DescribedLayer[]>;
  metricas: Record<string, number>;
  derivado?: true;
}

export interface DescribedElements {
  secuencia?: Partial<Record<SequenceBlock, DescribedElement>>;
  fila?: { alto?: number; capas: DescribedLayer[]; derivado?: true };
}

const IN_PAINT: Record<SequenceBlock, keyof SequencePaint> = { lifeline: 'lifeline', message: 'mensaje', activation: 'activacion', fragment: 'fragmento', note: 'nota' };

const fromTheme = (layer: ResolvedLayer): DescribedLayer => ({ nombre: layer.nombre, primitiva: layer.primitiva.tipo, props: layer.primitiva.props, encima: layer.encima === true, animada: layer.animacion !== undefined });
const painted = (layer: PaintedLayer): DescribedLayer => ({ nombre: layer.nombre, primitiva: layer.tipo, props: layer.props, encima: layer.encima === true, animada: layer.animacion !== undefined });
const markersOf = (origin: { tipo: string } | undefined, end: { tipo: string } | undefined): DescribedElement['marcadores'] => ({
  ...(origin !== undefined && { start: origin.tipo }),
  ...(end !== undefined && { end: end.tipo }),
});

/** `kind` picks the activation stack of the Node of that Node kind. */
function derived(name: SequenceBlock, paint: SequencePaint, kind: string | undefined): DescribedElement {
  const metrics = Object.fromEntries(Object.entries(SEQUENCE_SPEC[name].metricas).map(([key, m]) => [key, m.defecto]));
  const element = paint[IN_PAINT[name]];
  if ('base' in element) {
    const { base } = element as SequenceStrokes;
    const variants: Record<string, { capas: PaintedLayer[]; origen?: PaintedPrimitive; fin?: PaintedPrimitive }> = name === 'message' ? base.tipos : base.variantes;
    return { capas: base.capas.map(painted), marcadores: markersOf(base.origen, base.fin), parches: Object.fromEntries(Object.entries(variants).map(([v, t]) => [v, t.capas.map(painted)])), metricas: metrics, derivado: true };
  }
  const box = element as SequenceBoxPaint & Pick<ActivationPaint, 'porNodo'>;
  const layers = (kind === undefined ? undefined : box.porNodo?.nodo.tipos[kind]?.capas) ?? box.capas;
  return { capas: layers.map(painted), marcadores: {}, parches: Object.fromEntries(Object.entries(box.variantes).map(([v, c]) => [v, c.map(painted)])), metricas: metrics, derivado: true };
}

/** Declared ones carry the `diagram` patches; `kind` is the Node kind of the derived activation. */
export function themeElements(theme: Theme, diagram: DiagramType | undefined, kind?: string): DescribedElements {
  const resolved = themeForDiagram(resolveTheme(theme), diagram);
  const derivedPaint = diagram === 'sequence' ? resolvedStyle(theme, { diagrama: diagram }).pintura.secuencia : undefined;
  const sequence = Object.fromEntries(
    SEQUENCE_BLOCKS.flatMap((name): Array<[SequenceBlock, DescribedElement]> => {
      const block = resolved.secuencia?.[name];
      if (block === undefined) return derivedPaint === undefined ? [] : [[name, derived(name, derivedPaint, kind)]];
      const base = block.capas as ResolvedLayer[];
      const patches = Object.entries(block.parches).map(([variant, patch]) => [variant, applyOps(base, patch.ops, resolved.palette, 'parchear', SEQUENCE_SPEC[name].capas).pila.map(fromTheme)]);
      return [[name, { capas: base.map(fromTheme), marcadores: markersOf(block.origen, block.fin), parches: Object.fromEntries(patches), metricas: block.metricas }]];
    }),
  );
  const row: DescribedElements['fila'] =
    resolved.fila !== undefined
      ? { ...(resolved.fila.alto !== undefined && { alto: resolved.fila.alto }), capas: (resolved.fila.capas as ResolvedLayer[]).map(fromTheme) }
      : diagram === 'er'
        ? { capas: (resolvedStyle(theme, { diagrama: diagram }).pintura.fila?.base ?? []).map(painted), derivado: true }
        : undefined;
  return { ...(Object.keys(sequence).length > 0 && { secuencia: sequence }), ...(row !== undefined && { fila: row }) };
}
