/** Resolved style: Metrics (what `layout` measures) and paint (colors already as values), kept apart so that changing only the paint does not relayout. */
import type { Theme } from 'canonical';

import type { Animation, Effect, Transition } from './animation';
import { fontStack, resolveFonts } from './fonts';
import type { FontFace } from './fonts';
import type { TextMeasures } from './measurement';
import { metricsTable } from './metrics';
import type { Metrics, MetricsTable } from './metrics';
import { CATALOG } from './catalog';
import type { PrimitiveDefinition, PrimitiveName, SlotName } from './catalog';
import { resolveColor } from './color';
import type { ColorContext } from './color';
import { applyOps, cascade } from './patches';
import type { ResolvedLayer, ThemeElement, State, LayerOp, DiagramType } from './patches';
import * as derivation from './derivation';
import { ROW_KEYS, rowKey, rowVariants } from './row';
import type { RowTextName, RowVariant } from './row';
import { SEQUENCE_SPEC } from './sequence';
import { resolveTheme, themeForDiagram } from './theme';
import type { ResolvedTheme } from './theme';

export interface PaintedLayer {
  nombre: string;
  tipo: PrimitiveName;
  props: Record<string, number | string>;
  /** `over`; without the key, under the content. */
  encima?: true;
  animacion?: Animation;
}

export interface PaintedPrimitive {
  tipo: PrimitiveName;
  props: Record<string, number | string>;
}

/** Single narrowing of `tipo` to `PrimitiveName` (the Theme already validated it); use it instead of ad hoc casts. */
export const paintedPrimitive = (kind: string, props: Record<string, number | string>): PaintedPrimitive => ({ tipo: kind as PrimitiveName, props });

/** Strokes from bottom to top. */
export interface EdgePaint {
  capas: PaintedLayer[];
  /** Identifying Edges of an ER View; absent, those of `capas`. */
  identificante?: PaintedLayer[];
  origen?: PaintedPrimitive;
  fin?: PaintedPrimitive;
  etiqueta: PaintedPrimitive;
  /** Only the states the Theme declares: the stroke stack (and the identifying one) with the state patch. Paint-only. */
  estadosDeArista?: Partial<Record<State, { capas: PaintedLayer[]; identificante?: PaintedLayer[] }>>;
}

/** `capas` is the resting state; each declared state brings its full stack. */
export interface NodePaint {
  capas: PaintedLayer[];
  textos: Partial<Record<SlotName, PaintedPrimitive>>;
  estados: Partial<Record<State, PaintedLayer[]>>;
  /** Of the element, not of a Layer; absent if the Theme declares none. */
  animacion?: NodeAnimation;
}

export interface NodeAnimation {
  transicion?: Transition;
  transicionesDeEstado?: Partial<Record<State, Transition>>;
  entrada?: Effect;
  salida?: Effect;
  escalonadoMs?: number;
}

/** Fills from bottom to top; without Layers, only the Theme `background` color. */
export interface PagePaint {
  capas: PaintedLayer[];
  fijo: boolean;
}

export interface ElementPaint extends NodePaint {
  tipos: Record<string, NodePaint>;
}

/** Variants by `rowKey`, only those that differ from the base. Present in every ER View. */
export interface RowPaint {
  base: PaintedLayer[];
  variantes: Record<string, PaintedLayer[]>;
  /** By `rowKey(variant)@state`; a missing one is painted as at rest. */
  estados: Record<string, PaintedLayer[]>;
  textos: Partial<Record<RowTextName, PaintedPrimitive>>;
  /** The Theme does not declare `row`. */
  derivado?: true;
}

/** That of its variant if the Theme patches it; otherwise, the base. */
export const rowStack = (row: RowPaint, variant: RowVariant, state?: State): PaintedLayer[] =>
  (state === undefined ? undefined : row.estados[`${rowKey(variant)}@${state}`]) ?? row.variantes[rowKey(variant)] ?? row.base;

export interface SequenceStrokePaint {
  capas: PaintedLayer[];
  origen?: PaintedPrimitive;
  /** In `lifeline`, the marker of a destroyed Lifeline. */
  fin?: PaintedPrimitive;
  variantes: Record<string, VariantStroke>;
  /** In `message`, the stack of each Message type (`kind` patch or derived); empty in `lifeline`. */
  tipos: Record<string, VariantStroke>;
  /** Declared states: the base stack and each `kind` patch with the state patch over it. */
  estadosDeTrazo?: Partial<Record<State, { capas: PaintedLayer[]; variantes: Record<string, PaintedLayer[]> }>>;
}

export interface VariantStroke {
  capas: PaintedLayer[];
  origen?: PaintedPrimitive;
  fin?: PaintedPrimitive;
  /** Only the states the Theme declares: this stroke stack with the state patch. Paint-only. */
  estados?: Partial<Record<State, PaintedLayer[]>>;
}

export interface SequenceBoxPaint {
  capas: PaintedLayer[];
  textos: Record<string, PaintedPrimitive>;
  variantes: Record<string, PaintedLayer[]>;
  /** Only the states the Theme declares, with the state patch over the base and over each variant. */
  estados: Partial<Record<State, { capas: PaintedLayer[]; variantes: Record<string, PaintedLayer[]> }>>;
  /** The Theme does not declare the block. */
  derivado?: true;
}

/** By Palette color of the origin Node (`ORIGIN`), like the Edge. */
export interface SequenceStrokes {
  base: SequenceStrokePaint;
  origenes: Record<string, SequenceStrokePaint>;
  derivado?: true;
}

export interface ActivationPaint extends SequenceBoxPaint {
  /** Only if derived. */
  porNodo?: Pick<Paint, 'nodo' | 'grupo'>;
}

export interface FragmentPaint extends SequenceBoxPaint {
  colorDeGuarda: string;
}

export interface NotePaint extends SequenceBoxPaint {
  papel: { color: string; opacidadDeRelleno: number };
}

/** Declared or derived from `edge` and `node` (with `derivado`). */
export interface SequencePaint {
  lifeline: SequenceStrokes;
  mensaje: SequenceStrokes;
  activacion: ActivationPaint;
  fragmento: FragmentPaint;
  nota: NotePaint;
}

export interface Paint {
  /** `seed` token; without it, each Layer seed comes only from the id and the name. */
  semilla?: number;
  /** Includes each Node kind with patches or requested in `StyleOptions.tipos`. */
  nodo: ElementPaint;
  /** Without `group` in the Theme, the plain stack derived from its tokens. */
  grupo: { abierto: ElementPaint; colapsado: ElementPaint };
  /** `origenes`: by Palette color of the origin Node (`ORIGIN`). */
  arista: EdgePaint & { origenes: Record<string, EdgePaint> };
  pagina: PagePaint;
  /** Only in an ER View. */
  fila?: RowPaint;
  /** Only in a sequence View. */
  secuencia?: SequencePaint;
}

export interface ResolvedFonts {
  cuerpo: string;
  mono: string;
  caras: FontFace[];
}

export interface ResolvedStyle {
  /** Base entry of the table (Node without a Node kind). */
  metricas: Metrics;
  tabla: MetricsTable;
  pintura: Paint;
  fuentes: ResolvedFonts;
}

export interface StyleOptions {
  /** Applies the `diagram <type>` patches; `undefined` (explicit) without a View: the Theme without those patches. */
  diagrama: DiagramType | undefined;
  /** The same ones the Geometry was computed with, so the drawing Metrics are those of the layout. */
  medidas?: TextMeasures;
  /** Without them, `fuentes.caras` stays empty. */
  archivosDeFuente?: readonly string[];
  /** Palette name of the `color` of each Node kind. */
  tipos?: Readonly<Record<string, string | undefined>>;
  /** View override, applied at the end of each Node stack. */
  vista?: readonly LayerOp[];
  /** CSS variable (e.g. `--trazo`) that `COLOR` resolves to; without it, the color of `tipos` or the Theme border. */
  colorEnVariable?: string;
}

const FALLBACK_COLOR = '__borde';

const colorContext = (theme: ResolvedTheme, kindColor: string | undefined, variable?: string): { paleta: Record<string, string>; contexto: ColorContext } => {
  const name = kindColor !== undefined && Object.hasOwn(theme.palette, kindColor) ? kindColor : FALLBACK_COLOR;
  return { paleta: { ...theme.palette, [FALLBACK_COLOR]: theme.tokens.border }, contexto: { color: name, origen: name, ...(variable !== undefined && { variable }) } };
};

function resolveProps(
  primitive: { tipo: string; props: Readonly<Record<string, number | string>> },
  palette: Readonly<Record<string, string>>,
  context: ColorContext,
): Record<string, number | string> {
  const definition: PrimitiveDefinition = CATALOG[primitive.tipo as PrimitiveName];
  return Object.fromEntries(
    Object.entries(primitive.props).map(([key, value]) => [
      key,
      definition.propiedades[key]?.tipo === 'color' ? resolveColor(String(value), palette, context) : value,
    ]),
  );
}

function paintLayers(stack: readonly ResolvedLayer[], theme: ResolvedTheme, kindColor: string | undefined, variable?: string): PaintedLayer[] {
  const { paleta: palette, contexto: context } = colorContext(theme, kindColor, variable);
  return stack.map(({ nombre: name, primitiva: primitive, encima: above, animacion: animation }) => ({
    nombre: name,
    ...paintedPrimitive(primitive.tipo, resolveProps(primitive, palette, context)),
    ...(above === true && { encima: true as const }),
    ...(animation !== undefined && { animacion: animation }),
  }));
}

const DEFAULT_STROKE: ResolvedLayer = { nombre: 'line', primitiva: { tipo: 'line', props: { color: FALLBACK_COLOR, width: 1, style: 'solid', corner: 'sharp', cut: 6 } } };

/** `originColor` is a Palette name. */
function paintEdge(theme: ResolvedTheme, originColor: string | undefined): EdgePaint {
  const { arista: edge } = theme;
  const { paleta: palette, contexto: context } = colorContext(theme, originColor);
  const layers = paintLayers(edge.capas.length === 0 ? [DEFAULT_STROKE] : (edge.capas as ResolvedLayer[]), theme, originColor);
  // A marker without color takes that of the top stroke of the stack, not that of the halo below.
  const strokeColor = layers.at(-1)?.props['color'];
  const marker = (primitive: { tipo: string; props: Record<string, number | string> } | undefined): PaintedPrimitive | undefined => {
    if (primitive === undefined) return undefined;
    const props = resolveProps(primitive, palette, context);
    if (props['color'] === undefined && strokeColor !== undefined) props['color'] = strokeColor;
    return paintedPrimitive(primitive.tipo, props);
  };
  const label = edge.etiqueta ?? { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0 } };
  const identifying = edge.identificante === undefined ? undefined : paintLayers(applyOps(edge.capas.length === 0 ? [DEFAULT_STROKE] : (edge.capas as ResolvedLayer[]), edge.identificante, theme.palette, 'parchear', 'capa-arista').pila, theme, originColor);
  const origin = marker(edge.origen);
  const end = marker(edge.fin);
  const base = edge.capas.length === 0 ? [DEFAULT_STROKE] : (edge.capas as ResolvedLayer[]);
  const withState = (ops: readonly LayerOp[]) => {
    const stack = applyOps(base, ops, theme.palette, 'parchear', 'capa-arista').pila;
    const own = edge.identificante === undefined ? undefined : paintLayers(applyOps(applyOps(base, edge.identificante, theme.palette, 'parchear', 'capa-arista').pila, ops, theme.palette, 'parchear', 'capa-arista').pila, theme, originColor);
    return { capas: paintLayers(stack, theme, originColor), ...(own !== undefined && { identificante: own }) };
  };
  const declaredOnes = Object.keys(edge.estados ?? {}).sort() as State[];
  const states = declaredOnes.length === 0 ? undefined : Object.fromEntries(declaredOnes.map((state) => [state, withState(edge.estados?.[state] ?? [])]));
  return {
    capas: layers,
    ...(states !== undefined && { estadosDeArista: states }),
    ...(identifying !== undefined && { identificante: identifying }),
    ...(origin !== undefined && { origen: origin }),
    ...(end !== undefined && { fin: end }),
    etiqueta: paintedPrimitive(label.tipo, resolveProps(label, palette, context)),
  };
}

/** Group without Layers in the Theme: derived only from the tokens, never from the Node Layers. */
function plainGroup(theme: ResolvedTheme, collapsed: boolean, variable: string | undefined): PaintedLayer[] {
  const { foreground, border } = theme.tokens;
  const veil = `color-mix(in srgb, ${foreground} ${collapsed ? 8 : 4}%, transparent)`;
  return [
    { nombre: 'box', tipo: 'rect', props: { radius: 8 } },
    { nombre: 'fill', tipo: 'solid', props: { color: veil } },
    { nombre: 'border', tipo: collapsed ? 'dashed' : 'border', props: { color: variable === undefined ? border : `var(${variable})`, width: 1 } },
  ];
}

function rowPaint(theme: ResolvedTheme, variable: string | undefined): RowPaint | undefined {
  const { fila: row } = theme;
  if (row === undefined) return undefined;
  const stack = (v: RowVariant, state?: State): PaintedLayer[] => {
    const ops: ReadonlyArray<readonly LayerOp[]> = [v.impar ? row.alterna : [], ...ROW_KEYS.filter((k) => v.keys.includes(k)).map((k) => row.claves[k] ?? []), v.opcional ? row.opcional : [], state === undefined ? [] : (row.estados[state] ?? [])];
    const layers = ops.reduce<ResolvedLayer[]>((acc, patch) => (patch.length === 0 ? acc : applyOps(acc, patch, theme.palette, 'parchear').pila), row.capas as ResolvedLayer[]);
    return paintLayers(layers, theme, undefined, variable);
  };
  const base = stack({ impar: false, keys: [], opcional: false });
  const variants: Record<string, PaintedLayer[]> = {};
  const states: Record<string, PaintedLayer[]> = {};
  const declaredOnes = (Object.keys(row.estados) as State[]).filter((e) => (row.estados[e]?.length ?? 0) > 0);
  for (const v of rowVariants()) {
    const own = stack(v);
    if (JSON.stringify(own) !== JSON.stringify(base)) variants[rowKey(v)] = own;
    for (const state of declaredOnes) states[`${rowKey(v)}@${state}`] = stack(v, state);
  }
  const { paleta: palette, contexto: context } = colorContext(theme, undefined, variable);
  const texts = Object.fromEntries(Object.entries(row.textos).map(([name, text]) => [name, paintedPrimitive(text.tipo, resolveProps(text, palette, context))]));
  return { base, variantes: variants, estados: states, textos: texts };
}

function sequencePaint(theme: ResolvedTheme, variable: string | undefined, paint: Pick<Paint, 'nodo' | 'grupo' | 'arista'>): SequencePaint {
  const sequence = theme.secuencia ?? {};
  const marker = (primitive: { tipo: string; props: Record<string, number | string> } | undefined, palette: Record<string, string>, context: ColorContext, color: unknown): PaintedPrimitive | undefined => {
    if (primitive === undefined) return undefined;
    const props = resolveProps(primitive, palette, context);
    if (props['color'] === undefined && color !== undefined) props['color'] = color as string;
    return paintedPrimitive(primitive.tipo, props);
  };
  const stroke = (name: 'lifeline' | 'message', originColor: string | undefined): SequenceStrokePaint | undefined => {
    const block = sequence[name];
    if (block === undefined) return undefined;
    const { paleta: palette, contexto: context } = colorContext(theme, originColor);
    const placement = SEQUENCE_SPEC[name].capas;
    const layers = paintLayers(block.capas.length === 0 ? [DEFAULT_STROKE] : (block.capas as ResolvedLayer[]), theme, originColor);
    const strokeColor = layers.at(-1)?.props['color'];
    const origin = marker(block.origen, palette, context, strokeColor);
    const end = marker(block.fin, palette, context, strokeColor);
    const variants = Object.fromEntries(
      Object.entries(block.parches).map(([variant, patch]) => {
        const ownOnes = paintLayers(applyOps(block.capas as ResolvedLayer[], patch.ops, theme.palette, 'parchear', placement).pila, theme, originColor);
        const ownColor = ownOnes.at(-1)?.props['color'];
        const o = marker(patch.origen, palette, context, ownColor);
        const f = marker(patch.fin, palette, context, ownColor);
        return [variant, { capas: ownOnes, ...(o !== undefined && { origen: o }), ...(f !== undefined && { fin: f }) }];
      }),
    );
    const declaredOnes = (Object.keys(block.estados) as State[]).filter((e) => (block.estados[e]?.length ?? 0) > 0).sort();
    const withState = (baseLayers: readonly ResolvedLayer[], ops: readonly LayerOp[]): PaintedLayer[] => paintLayers(applyOps(baseLayers, ops, theme.palette, 'parchear', placement).pila, theme, originColor);
    const stateBase = block.capas.length === 0 ? [DEFAULT_STROKE] : (block.capas as ResolvedLayer[]);
    const strokeStates = Object.fromEntries(
      declaredOnes.map((state) => {
        const ops = block.estados[state] ?? [];
        const fromVariant = (patch: { ops: readonly LayerOp[] }): PaintedLayer[] => withState(applyOps(stateBase, patch.ops, theme.palette, 'parchear', placement).pila, ops);
        return [state, { capas: withState(stateBase, ops), variantes: Object.fromEntries(Object.entries(block.parches).map(([variant, patch]) => [variant, fromVariant(patch)])) }];
      }),
    );
    return {
      capas: layers,
      ...(origin !== undefined && { origen: origin }),
      ...(end !== undefined && { fin: end }),
      variantes: variants,
      tipos: {},
      ...(declaredOnes.length > 0 && { estadosDeTrazo: strokeStates }),
    };
  };
  const byColor = (name: 'lifeline' | 'message', derive: (declared: SequenceStrokePaint | undefined, edge: EdgePaint) => SequenceStrokePaint): SequenceStrokes => {
    const derived = sequence[name] === undefined;
    const derivedFrom = (color: string | undefined): SequenceStrokePaint => derive(stroke(name, color), color === undefined ? paint.arista : (paint.arista.origenes[color] ?? paint.arista));
    return { base: derivedFrom(undefined), origenes: Object.fromEntries(Object.keys(theme.palette).sort().map((color) => [color, derivedFrom(color)])), ...(derived && { derivado: true as const }) };
  };
  const box = (name: 'activation' | 'fragment' | 'note'): SequenceBoxPaint | undefined => {
    const block = sequence[name];
    if (block === undefined) return undefined;
    const { paleta: palette, contexto: context } = colorContext(theme, undefined, variable);
    const placement = SEQUENCE_SPEC[name].capas;
    return {
      capas: paintLayers(block.capas as ResolvedLayer[], theme, undefined, variable),
      textos: Object.fromEntries(Object.entries(block.textos).map(([key, text]) => [key, paintedPrimitive(text.tipo, resolveProps(text, palette, context))])),
      variantes: Object.fromEntries(
        Object.entries(block.parches).map(([variant, patch]) => [variant, paintLayers(applyOps(block.capas as ResolvedLayer[], patch.ops, theme.palette, 'parchear', placement).pila, theme, undefined, variable)]),
      ),
      estados: Object.fromEntries(
        (Object.keys(block.estados) as State[]).sort().map((state) => {
          const ops = block.estados[state] ?? [];
          const paintWithOps = (layers: readonly ResolvedLayer[]): PaintedLayer[] => paintLayers(applyOps(layers, ops, theme.palette, 'parchear', placement).pila, theme, undefined, variable);
          return [state, { capas: paintWithOps(block.capas as ResolvedLayer[]), variantes: Object.fromEntries(Object.entries(block.parches).map(([variant, patch]) => [variant, paintWithOps(applyOps(block.capas as ResolvedLayer[], patch.ops, theme.palette, 'parchear', placement).pila)])) }];
        }),
      ),
    };
  };
  return {
    lifeline: byColor('lifeline', derivation.lifeline),
    mensaje: byColor('message', derivation.message),
    activacion: box('activation') ?? derivation.derivedActivation(paint),
    fragmento: derivation.fragment(box('fragment'), paint.nodo.capas, paint.arista, theme.tokens.border),
    nota: derivation.note(box('note'), theme.palette, theme.tokens.border),
  };
}

export function resolvedStyle(theme: Theme, options: StyleOptions): ResolvedStyle {
  const resolved = themeForDiagram(resolveTheme(theme), options.diagrama);
  const variable = options.colorEnVariable;
  const paintOf = (element: ThemeElement, kind: string | undefined, color: string | undefined, collapsed = false): NodePaint => {
    const block = resolved[element];
    const plain = element === 'grupo' && resolved.grupo.capas.length === 0;
    const stack = (state?: State): PaintedLayer[] =>
      plain
        ? plainGroup(resolved, collapsed, variable)
        : paintLayers(
            cascade(resolved, { ...(kind !== undefined && { tipo: kind }), ...(state !== undefined && { estado: state }), ...(collapsed && { colapsado: collapsed }), ...(element === 'nodo' && options.vista && { vista: options.vista }) }, element),
            resolved,
            color,
            variable,
          );
    const texts = element === 'grupo' && collapsed ? { ...resolved.nodo.textos, ...resolved.grupo.colapsado.textos } : block.textos;
    const { paleta: palette, contexto: context } = colorContext(resolved, color, variable);
    return {
      capas: stack(),
      textos: Object.fromEntries(Object.entries(texts).map(([slot, text]) => [slot, paintedPrimitive(text.tipo, resolveProps(text, palette, context))])),
      estados: plain ? {} : Object.fromEntries((Object.keys(block.estados) as State[]).sort().map((state) => [state, stack(state)])),
    };
  };
  const elementOf = (element: ThemeElement, collapsed = false): ElementPaint => {
    const colors = options.tipos ?? {};
    const kinds = [...new Set([...(element === 'nodo' ? Object.keys(colors) : []), ...Object.keys(resolved[element].tipos)])];
    return {
      ...paintOf(element, undefined, undefined, collapsed),
      ...(resolved[element].animacion !== undefined && { animacion: resolved[element].animacion }),
      tipos: Object.fromEntries(kinds.map((kind) => [kind, paintOf(element, kind, colors[kind], collapsed)])),
    };
  };
  const table = metricsTable(theme, options.diagrama, options.medidas);
  const node = elementOf('nodo');
  const group = { abierto: elementOf('grupo'), colapsado: elementOf('grupo', true) };
  const edge = { ...paintEdge(resolved, undefined), origenes: Object.fromEntries(Object.keys(resolved.palette).sort().map((color) => [color, paintEdge(resolved, color)])) };
  const row = options.diagrama === 'er' ? (rowPaint(resolved, variable) ?? derivation.derivedRow()) : undefined;
  const sequence = options.diagrama === 'sequence' ? sequencePaint(resolved, variable, { nodo: node, grupo: group, arista: edge }) : undefined;
  const fallback = resolved.fonts['fallback'];
  return {
    metricas: table.base,
    tabla: table,
    fuentes: {
      cuerpo: fontStack(resolved.fonts.body, fallback),
      mono: fontStack(resolved.fonts.mono, fallback),
      caras: resolveFonts(resolved.fonts, options.archivosDeFuente ?? []).caras,
    },
    pintura: {
      ...(resolved.tokens.seed !== undefined && { semilla: Number(resolved.tokens.seed) }),
      nodo: node,
      grupo: group,
      pagina: { capas: paintLayers(resolved.pagina.capas as ResolvedLayer[], resolved, undefined), fijo: resolved.pagina.fijo },
      ...(row !== undefined && { fila: row }),
      ...(sequence !== undefined && { secuencia: sequence }),
      arista: edge,
    },
  };
}
