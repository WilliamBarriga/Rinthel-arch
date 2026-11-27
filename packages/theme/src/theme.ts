/** Strict schema of the resolved Theme (no inheritance; Layers are validated with `buildPrimitive`) and the neutral Theme. */
import { z } from 'zod';
import type { Theme } from 'canonical';

import { EASINGS, EFFECTS, MOTIONS, ANIMATABLE_PROPERTIES } from './animation';
import { SLOT_DEFINITION, SLOTS, buildPrimitive } from './catalog';
import type { PrimitiveName, SlotName, Primitive, PrimitivePlacement } from './catalog';
import { ALIGNMENTS, DEFAULT_HEADER, DIRECTIONS, DEFAULT_LAYOUT, NODE_ONLY_SLOTS, isBox } from './slot-layout';
import type { SlotLayoutBox, SlotLayoutElement } from './slot-layout';
import { SEQUENCE_BLOCKS, SEQUENCE_SPEC } from './sequence';
import { TABLE_RADIUS, isPill } from './derivation';
import { ROW_HEIGHT, ROW_KEYS, ROW_TEXT_NAMES, ROW_TEXTS } from './row';
import { STATES, DIAGRAM_TYPES, applyOps, opTouchesMetrics, validateOps } from './patches';
import type { ResolvedLayer, LayerOp, DiagramType } from './patches';

const easingSchema = z.enum(EASINGS);
const timingSchema = { duracionMs: z.number().min(1).max(60000), easing: easingSchema, retardoMs: z.number().min(0).max(10000) };

const animationSchema = z.discriminatedUnion('clase', [
  z.strictObject({
    clase: z.literal('movimiento'),
    movimiento: z.enum(Object.keys(MOTIONS) as [keyof typeof MOTIONS, ...Array<keyof typeof MOTIONS>]),
    intensidad: z.number().min(0).max(1).optional(),
    reducido: z.literal('still'),
    ...timingSchema,
  }),
  z.strictObject({
    clase: z.literal('keyframes'),
    propiedad: z.enum(Object.keys(ANIMATABLE_PROPERTIES) as [keyof typeof ANIMATABLE_PROPERTIES, ...Array<keyof typeof ANIMATABLE_PROPERTIES>]),
    pasos: z.array(z.strictObject({ en: z.number().min(0).max(100), valor: z.number() })).min(2),
    reducido: z.literal('still'),
    ...timingSchema,
  }),
]);

const transitionSchema = z.strictObject({ duracionMs: timingSchema.duracionMs, easing: easingSchema, reducido: z.enum(['fade', 'instant']) });
const effectSchema = z.strictObject({ efecto: z.enum(EFFECTS), reducido: z.enum(['fade', 'instant']), ...timingSchema });

const nodeAnimationSchema = z.strictObject({
  transicion: transitionSchema.optional(),
  transicionesDeEstado: z.partialRecord(z.enum(STATES), transitionSchema).optional(),
  entrada: effectSchema.optional(),
  salida: effectSchema.optional(),
  escalonadoMs: z.number().min(0).max(2000).optional(),
});

const layerSchema = z.strictObject({
  nombre: z.string().min(1),
  primitiva: z.strictObject({
    tipo: z.string().min(1),
    props: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  /** `over`; without it, under the content. */
  encima: z.literal(true).optional(),
  animacion: animationSchema.optional(),
});

export const opSchema = z.strictObject({
  nombre: z.string().min(1),
  quitar: z.literal(true).optional(),
  primitiva: z.string().min(1).optional(),
  props: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  antes: z.string().min(1).optional(),
  despues: z.string().min(1).optional(),
  encima: z.literal(true).optional(),
  animacion: animationSchema.nullable().optional(),
});

/** The name is checked against the catalog in `resolveTheme`. */
const primitiveSchema = z.strictObject({
  tipo: z.custom<PrimitiveName>((value) => typeof value === 'string' && value.length > 0),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
});

const edgeSchema = z.strictObject({
  /** Bottom to top. Empty: a stroke in the border color. */
  capas: z.array(layerSchema).default([]),
  origen: primitiveSchema.optional(),
  fin: primitiveSchema.optional(),
  etiqueta: primitiveSchema.optional(),
  /** Identifying Edges of an ER View; absent, the same stroke as the others. */
  identificante: z.array(opSchema).optional(),
  /** Paint-only patches of the stroke stack per state (`edge { state planned { ... } }`). */
  estados: z.partialRecord(z.enum(STATES), z.array(opSchema)).optional(),
  /** Markers and label of a Diagram type replace those of the Theme. */
  diagramas: z
    .partialRecord(
      z.enum(DIAGRAM_TYPES),
      z.strictObject({ ops: z.array(opSchema).default([]), origen: primitiveSchema.optional(), fin: primitiveSchema.optional(), etiqueta: primitiveSchema.optional() }),
    )
    .optional(),
});

const pageSchema = z.strictObject({
  /** Bottom to top. Empty: only the `background` color. */
  capas: z.array(layerSchema).default([]),
  /** Fixed to the viewport; otherwise it moves and scales with pan/zoom. */
  fijo: z.boolean().default(false),
});

const SLOT_NAMES = SLOTS as [SlotName, ...SlotName[]];

const elementSchema: z.ZodType<SlotLayoutElement> = z.lazy(() => z.union([leafSchema, boxSchema]));
const leafSchema = z.strictObject({ slot: z.enum(SLOT_NAMES), align: z.enum(ALIGNMENTS).optional() });
const boxSchema: z.ZodType<SlotLayoutBox> = z.strictObject({
  direccion: z.enum(DIRECTIONS),
  gap: z.number().min(0).max(64),
  pad: z.number().min(0).max(64),
  padY: z.number().min(0).max(64).optional(),
  anchoMinimo: z.number().min(0).max(1200).optional(),
  altoMinimo: z.number().min(0).max(600).optional(),
  holgura: z.number().min(0).max(400).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  hijos: z.array(elementSchema),
}) as z.ZodType<SlotLayoutBox>;

/** Unlike a state, it may change the Metrics. */
const diagramPatchSchema = z.strictObject({ ops: z.array(opSchema).default([]), slots: boxSchema.optional() });

const nodeSchema = z.strictObject({
  /** Bottom to top. */
  capas: z.array(layerSchema).default([]),
  slots: boxSchema.default(DEFAULT_LAYOUT),
  textos: z.partialRecord(z.enum(SLOT_NAMES), primitiveSchema).default({}),
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  estados: z.partialRecord(z.enum(STATES), z.array(opSchema)).default({}),
  /** Applied over the base before the Node kind ones. */
  diagramas: z.partialRecord(z.enum(DIAGRAM_TYPES), diagramPatchSchema).optional(),
  animacion: nodeAnimationSchema.optional(),
});

/** Only valid in ER Views; absent, the row uses the paint of the `attrs` Slot. */
const rowSchema = z.strictObject({
  capas: z.array(layerSchema).default([]),
  alto: z.number().min(ROW_HEIGHT.min).max(ROW_HEIGHT.max).optional(),
  alterna: z.array(opSchema).default([]),
  textos: z.partialRecord(z.enum(ROW_TEXT_NAMES as [keyof typeof ROW_TEXTS, ...Array<keyof typeof ROW_TEXTS>]), primitiveSchema).default({}),
  claves: z.partialRecord(z.enum(ROW_KEYS as [(typeof ROW_KEYS)[number], ...Array<(typeof ROW_KEYS)[number]>]), z.array(opSchema)).default({}),
  opcional: z.array(opSchema).default([]),
  /** Paint only; applied over the stack of the row variant. */
  estados: z.partialRecord(z.enum(STATES), z.array(opSchema)).default({}),
});

/** Message (`kind`) or Fragment (`op`) variant; markers only in Messages. */
const variantPatchSchema = z.strictObject({ ops: z.array(opSchema).default([]), origen: primitiveSchema.optional(), fin: primitiveSchema.optional() });

/** Absent, the core derives it from `edge` and `node`; what each one admits is given by `SEQUENCE_SPEC`. */
const sequenceBlockSchema = z.strictObject({
  capas: z.array(layerSchema).default([]),
  origen: primitiveSchema.optional(),
  fin: primitiveSchema.optional(),
  textos: z.record(z.string(), primitiveSchema).default({}),
  parches: z.record(z.string(), variantPatchSchema).default({}),
  estados: z.partialRecord(z.enum(STATES), z.array(opSchema)).default({}),
  metricas: z.record(z.string(), z.number()).default({}),
});
const sequenceSchema = z.strictObject({
  lifeline: sequenceBlockSchema.optional(),
  activation: sequenceBlockSchema.optional(),
  message: sequenceBlockSchema.optional(),
  fragment: sequenceBlockSchema.optional(),
  note: sequenceBlockSchema.optional(),
});

const fill = z.number().min(0).max(128);
const paddingSchema = z.strictObject({ top: fill, left: fill, bottom: fill, right: fill });

/** Without Layers, the Resolved style gives a plain Group from the Palette. */
const groupSchema = z.strictObject({
  capas: z.array(layerSchema).default([]),
  /** Header of the open Group. */
  slots: boxSchema.default(DEFAULT_HEADER),
  textos: z.partialRecord(z.enum(SLOT_NAMES), primitiveSchema).default({}),
  /** Children area, below the header. */
  padding: paddingSchema.default({ top: 8, left: 16, bottom: 16, right: 16 }),
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  estados: z.partialRecord(z.enum(STATES), z.array(opSchema)).default({}),
  /** Like the Node ones, plus `padding`. */
  diagramas: z
    .partialRecord(z.enum(DIAGRAM_TYPES), z.strictObject({ ops: z.array(opSchema).default([]), slots: boxSchema.optional(), padding: paddingSchema.optional() }))
    .optional(),
  /** Closed Group, which behaves as a leaf Node; may change the box. */
  colapsado: z
    .strictObject({
      ops: z.array(opSchema).default([]),
      slots: boxSchema.optional(),
      textos: z.partialRecord(z.enum(SLOT_NAMES), primitiveSchema).optional(),
    })
    .default({ ops: [] }),
  animacion: nodeAnimationSchema.optional(),
});

export const DEFAULT_GROUP: z.output<typeof groupSchema> = {
  capas: [],
  slots: DEFAULT_HEADER,
  textos: {},
  padding: { top: 8, left: 16, bottom: 16, right: 16 },
  tipos: {},
  estados: {},
  colapsado: { ops: [] },
};

export const resolvedThemeSchema = z
  .strictObject({
    name: z.string().min(1),
    palette: z.record(z.string(), z.string()).default({}),
    fonts: z.object({ body: z.string().min(1), mono: z.string().min(1) }).catchall(z.string()),
    tokens: z
      .object({
        background: z.string().min(1),
        foreground: z.string().min(1),
        border: z.string().min(1),
      })
      .catchall(z.string())
      .superRefine((tokens, ctx) => {
        if (tokens.fontSize !== undefined && !/^\d+(\.\d+)?px$/.test(tokens.fontSize)) {
          ctx.addIssue({ code: 'custom', path: ['fontSize'], message: 'must be a size in px, e.g. "14px"' });
        }
        if (tokens.seed !== undefined && !/^\d+$/.test(tokens.seed)) {
          ctx.addIssue({ code: 'custom', path: ['seed'], message: '`seed` must be a non-negative integer, e.g. 7' });
        }
      }),
    nodo: nodeSchema.default({ capas: [], slots: DEFAULT_LAYOUT, textos: {}, tipos: {}, estados: {} }),
    grupo: groupSchema.default(DEFAULT_GROUP),
    arista: edgeSchema.default({ capas: [] }),
    pagina: pageSchema.default({ capas: [], fijo: false }),
    /** Optional so it stays out of the snapshots of Themes that do not use it. */
    fila: rowSchema.optional(),
    /** Optional so it stays out of the snapshots of Themes that do not use them. */
    secuencia: sequenceSchema.optional(),
  })
  .superRefine((theme, ctx) => {
    const validate = (primitive: { tipo: string; props: Record<string, string | number> }, placement: PrimitivePlacement, path: Array<string | number>): void => {
      const props = Object.entries(primitive.props).map(([key, value]) => ({ clave: key, valor: value }));
      for (const error of buildPrimitive(primitive.tipo, props, theme.palette, placement).errores) {
        ctx.addIssue({ code: 'custom', path: [...path, ...(error.clave === undefined ? [] : ['props', error.clave])], message: error.mensaje });
      }
    };
    const fills = new Set<string>();
    theme.pagina.capas.forEach((layer, i) => {
      if (fills.has(layer.nombre)) ctx.addIssue({ code: 'custom', path: ['pagina', 'capas', i, 'nombre'], message: `Duplicate Layer '${layer.nombre}'` });
      fills.add(layer.nombre);
      validate(layer.primitiva, 'capa-pagina', ['pagina', 'capas', i, 'primitiva']);
    });
    const strokes = new Set<string>();
    theme.arista.capas.forEach((layer, i) => {
      if (strokes.has(layer.nombre)) ctx.addIssue({ code: 'custom', path: ['arista', 'capas', i, 'nombre'], message: `Duplicate Layer '${layer.nombre}'` });
      strokes.add(layer.nombre);
      validate(layer.primitiva, 'capa-arista', ['arista', 'capas', i, 'primitiva']);
    });
    if (theme.arista.origen !== undefined) validate(theme.arista.origen, 'marcador', ['arista', 'origen']);
    if (theme.arista.fin !== undefined) validate(theme.arista.fin, 'marcador', ['arista', 'fin']);
    if (theme.arista.etiqueta !== undefined) validate(theme.arista.etiqueta, 'etiqueta', ['arista', 'etiqueta']);
    for (const [diagram, patch] of Object.entries(theme.arista.diagramas ?? {})) {
      for (const e of validateOps([theme.arista.capas as ResolvedLayer[]], patch.ops, theme.palette, 'parchear', 'capa-arista')) {
        ctx.addIssue({ code: 'custom', path: ['arista', 'diagramas', diagram, 'ops', e.indice], message: e.mensaje });
      }
      if (patch.origen !== undefined) validate(patch.origen, 'marcador', ['arista', 'diagramas', diagram, 'origen']);
      if (patch.fin !== undefined) validate(patch.fin, 'marcador', ['arista', 'diagramas', diagram, 'fin']);
      if (patch.etiqueta !== undefined) validate(patch.etiqueta, 'etiqueta', ['arista', 'diagramas', diagram, 'etiqueta']);
    }
    if (theme.arista.identificante !== undefined) {
      for (const e of validateOps([theme.arista.capas as ResolvedLayer[]], theme.arista.identificante, theme.palette, 'parchear', 'capa-arista')) {
        ctx.addIssue({ code: 'custom', path: ['arista', 'identificante', e.indice], message: e.mensaje });
      }
    }
    validateElement(ctx, theme, 'nodo');
    validateElement(ctx, theme, 'grupo');
    if (theme.fila !== undefined) validateRow(ctx, theme, theme.fila);
    if (theme.secuencia !== undefined) validateSequence(ctx, theme, theme.secuencia);
  });

function validateSequence(ctx: z.RefinementCtx, theme: ResolvedTheme, sequence: NonNullable<ResolvedTheme['secuencia']>): void {
  for (const name of SEQUENCE_BLOCKS) {
    const block = sequence[name];
    if (block === undefined) continue;
    const spec = SEQUENCE_SPEC[name];
    const failure = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: ['secuencia', name, ...path], message });
    const primitive = (p: { tipo: string; props: Record<string, string | number> }, placement: PrimitivePlacement, path: Array<string | number>): void => {
      const props = Object.entries(p.props).map(([key, value]) => ({ clave: key, valor: value }));
      for (const error of buildPrimitive(p.tipo, props, theme.palette, placement).errores) failure([...path, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
    };
    const views = new Set<string>();
    block.capas.forEach((layer, i) => {
      if (views.has(layer.nombre)) failure(['capas', i, 'nombre'], `Duplicate Layer '${layer.nombre}'`);
      views.add(layer.nombre);
      primitive(layer.primitiva, spec.capas, ['capas', i, 'primitiva']);
    });
    for (const [side, p] of [['origen', block.origen], ['fin', block.fin]] as const) {
      if (p === undefined) continue;
      if (!spec.marcadores.includes(side === 'origen' ? 'start' : 'end')) failure([side], `'${name}' does not support the marker '${side === 'origen' ? 'start' : 'end'}'`);
      else primitive(p, 'marcador', [side]);
    }
    for (const [key, text] of Object.entries(block.textos)) {
      const allowed = spec.textos[key];
      if (allowed === undefined) failure(['textos', key], `'${name}' has no style '${key}'`);
      else if (text.tipo !== allowed.primitiva) failure(['textos', key], `style '${key}' of '${name}' uses Primitive '${allowed.primitiva}', not '${text.tipo}'`);
      else primitive(text, allowed.ubicacion, ['textos', key]);
    }
    for (const [key, value] of Object.entries(block.metricas)) {
      const range = spec.metricas[key];
      if (range === undefined) failure(['metricas', key], `'${name}' has no Metric '${key}'`);
      else if (value < range.min || value > range.max) failure(['metricas', key], `'${key}' of '${name}' ranges from ${range.min} to ${range.max}`);
    }
    const base = block.capas as ResolvedLayer[];
    for (const [variant, patch] of Object.entries(block.parches)) {
      if (spec.parches === undefined || !spec.parches.nombres.includes(variant)) failure(['parches', variant], `'${variant}' is not a variant of '${name}'`);
      for (const e of validateOps([base], patch.ops, theme.palette, 'parchear', spec.capas)) failure(['parches', variant, 'ops', e.indice], e.mensaje);
      if (patch.origen !== undefined) primitive(patch.origen, 'marcador', ['parches', variant, 'origen']);
      if (patch.fin !== undefined) primitive(patch.fin, 'marcador', ['parches', variant, 'fin']);
    }
    for (const [state, ops] of Object.entries(block.estados)) {
      for (const e of validateOps([base], ops, theme.palette, 'parchear', spec.capas)) failure(['estados', state, e.indice], e.mensaje);
    }
  }
}

/** `row` patches cannot touch the Metrics. */
function validateRow(ctx: z.RefinementCtx, theme: ResolvedTheme, row: NonNullable<ResolvedTheme['fila']>): void {
  const failure = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: ['fila', ...path], message });
  const views = new Set<string>();
  row.capas.forEach((layer, i) => {
    if (views.has(layer.nombre)) failure(['capas', i, 'nombre'], `Duplicate Layer '${layer.nombre}'`);
    views.add(layer.nombre);
    const props = Object.entries(layer.primitiva.props).map(([key, value]) => ({ clave: key, valor: value }));
    for (const error of buildPrimitive(layer.primitiva.tipo, props, theme.palette).errores) failure(['capas', i, 'primitiva', ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
  });
  const base = row.capas as ResolvedLayer[];
  const patches: Array<[Array<string | number>, readonly LayerOp[]]> = [
    [['alterna'], row.alterna],
    [['opcional'], row.opcional],
    ...Object.entries(row.estados).map(([state, ops]): [Array<string | number>, readonly LayerOp[]] => [['estados', state], ops ?? []]),
    ...Object.entries(row.claves).map(([key, ops]): [Array<string | number>, readonly LayerOp[]] => [['claves', key], ops]),
  ];
  for (const [issuePath, ops] of patches) {
    for (const e of validateOps([base], ops, theme.palette, 'parchear')) failure([...issuePath, e.indice], e.mensaje);
    ops.forEach((op, index) => {
      const ratio = opTouchesMetrics(op, [base]);
      if (ratio !== undefined) failure([...issuePath, index], `a row patch cannot touch the Metrics: ${ratio}`);
    });
  }
  for (const [name, text] of Object.entries(row.textos)) {
    const props = Object.entries(text.props).map(([key, value]) => ({ clave: key, valor: value }));
    for (const error of buildPrimitive(text.tipo, props, theme.palette, 'texto-slot').errores) failure(['textos', name, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
    const expected = ROW_TEXTS[name as keyof typeof ROW_TEXTS];
    if (text.tipo !== expected) failure(['textos', name], `row text '${name}' is styled with Primitive '${expected}', not '${text.tipo}'`);
  }
}

type NodeOrGroup = 'nodo' | 'grupo';

/** A state patch cannot touch the Metrics; in the Group neither can a Node kind one (its Metrics have no per-kind entry). */
function validateElement(ctx: z.RefinementCtx, theme: ResolvedTheme, element: NodeOrGroup): void {
  const block = theme[element];
  const failure = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: [element, ...path], message });
  const views = new Set<string>();
  block.capas.forEach((layer, i) => {
    if (views.has(layer.nombre)) failure(['capas', i, 'nombre'], `Duplicate Layer '${layer.nombre}'`);
    views.add(layer.nombre);
    const { errores: errors } = buildPrimitive(
      layer.primitiva.tipo,
      Object.entries(layer.primitiva.props).map(([key, value]) => ({ clave: key, valor: value })),
      theme.palette,
    );
    for (const error of errors) failure(['capas', i, 'primitiva', ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
  });
  /** Duplicates are counted per tree (header, collapsed). */
  const walk = (box: SlotLayoutBox, issuePath: string, inTree = new Set<string>()): void => {
    for (const child of box.hijos) {
      if (isBox(child)) walk(child, issuePath, inTree);
      else if (inTree.has(child.slot)) failure([issuePath], `Duplicate Slot '${child.slot}'`);
      else if (element === 'grupo' && NODE_ONLY_SLOTS.includes(child.slot)) failure([issuePath], `Slot '${child.slot}' is not valid in a Group: only in a leaf Node`);
      else inTree.add(child.slot);
    }
  };
  walk(block.slots, 'slots');
  const slotStyle = (texts: Partial<Record<SlotName, Primitive>>, issuePath: Array<string | number>): void => {
    for (const [slot, text] of Object.entries(texts)) {
      const props = Object.entries(text.props).map(([key, value]) => ({ clave: key, valor: value }));
      for (const error of buildPrimitive(text.tipo, props, theme.palette, 'texto-slot').errores) failure([...issuePath, slot, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
      const expected = SLOT_DEFINITION[slot as SlotName].estilo;
      if (text.tipo !== expected) failure([...issuePath, slot], `Slot '${slot}' is styled with Primitive '${expected}', not '${text.tipo}'`);
    }
  };
  slotStyle(block.textos, ['textos']);

  const base = block.capas as ResolvedLayer[];
  const stacks = [base];
  const withoutMetrics = (ops: readonly LayerOp[], candidates: ReadonlyArray<readonly ResolvedLayer[]>, issuePath: Array<string | number>, what: string): void => {
    ops.forEach((op, index) => {
      const ratio = opTouchesMetrics(op, candidates);
      if (ratio !== undefined) failure([...issuePath, index], `a ${what} patch cannot touch the Metrics: ${ratio}${what === 'state' ? '; hover never re-lays out' : ''}`);
    });
  };
  for (const [diagram, patch] of Object.entries(block.diagramas ?? {})) {
    for (const e of validateOps([base], patch.ops, theme.palette, 'parchear')) failure(['diagramas', diagram, 'ops', e.indice], e.mensaje);
    if (patch.slots !== undefined) walk(patch.slots, 'diagramas');
    stacks.push(applyWithoutErrors(base, patch.ops, theme.palette));
  }
  const bases = [...stacks];
  for (const [kind, ops] of Object.entries(block.tipos)) {
    for (const e of validateOps(bases, ops, theme.palette, 'parchear')) failure(['tipos', kind, e.indice], e.mensaje);
    if (element === 'grupo') withoutMetrics(ops, bases, ['tipos', kind], 'Group kind');
    stacks.push(...bases.map((stack) => applyWithoutErrors(stack, ops, theme.palette)));
  }
  if (element === 'grupo') {
    const collapsed = (block as z.output<typeof groupSchema>).colapsado;
    for (const e of validateOps(stacks, collapsed.ops, theme.palette, 'parchear')) failure(['colapsado', 'ops', e.indice], e.mensaje);
    if (collapsed.textos !== undefined) slotStyle(collapsed.textos, ['colapsado', 'textos']);
    if (collapsed.slots !== undefined) walk(collapsed.slots, 'colapsado');
    stacks.push(...stacks.map((stack) => applyWithoutErrors(stack, collapsed.ops, theme.palette)));
  }
  for (const [state, ops] of Object.entries(block.estados)) {
    for (const e of validateOps(stacks, ops, theme.palette, 'parchear')) failure(['estados', state, e.indice], e.mensaje);
    withoutMetrics(ops, stacks, ['estados', state], 'state');
  }
}

type Complete = <P extends { tipo: string; props: Record<string, string | number> }>(primitive: P, placement: PrimitivePlacement) => P | Primitive;

function withSequenceDefaults(sequence: NonNullable<ResolvedTheme['secuencia']>, complete: Complete): NonNullable<ResolvedTheme['secuencia']> {
  const output: NonNullable<ResolvedTheme['secuencia']> = {};
  for (const name of SEQUENCE_BLOCKS) {
    const block = sequence[name];
    if (block === undefined) continue;
    const spec = SEQUENCE_SPEC[name];
    const markers = (p: { origen?: Primitive | undefined; fin?: Primitive | undefined }): { origen?: Primitive; fin?: Primitive } => ({
      ...(p.origen !== undefined && { origen: complete(p.origen, 'marcador') }),
      ...(p.fin !== undefined && { fin: complete(p.fin, 'marcador') }),
    });
    output[name] = {
      ...block,
      capas: block.capas.map((c) => ({ ...c, primitiva: complete(c.primitiva, spec.capas) })),
      ...markers(block),
      textos: Object.fromEntries(Object.entries(block.textos).map(([key, text]) => [key, complete(text, spec.textos[key]?.ubicacion ?? 'texto-slot')])),
      parches: Object.fromEntries(Object.entries(block.parches).map(([variant, patch]) => [variant, { ...patch, ...markers(patch) }])),
    };
  }
  return output;
}

const applyWithoutErrors = (base: ResolvedLayer[], ops: Parameters<typeof applyOps>[1], palette: Record<string, string>): ResolvedLayer[] =>
  applyOps(base, ops, palette, 'parchear').pila;

export type ResolvedTheme = z.output<typeof resolvedThemeSchema>;

/** `pill` and `circle` clip the rows: in `er` they become `rect` with a bounded radius. */
const asTable = (layer: ResolvedTheme['nodo']['capas'][number]): ResolvedTheme['nodo']['capas'][number] =>
  isPill(layer.primitiva.tipo) ? { ...layer, primitiva: { tipo: 'rect', props: { radius: TABLE_RADIUS } } } : layer;

const byDiagram = new WeakMap<object, Map<DiagramType, ResolvedTheme>>();

/** The base already patched with `diagram <type>`; without a type or without a patch, the same Theme. Memoized per Theme. */
export function themeForDiagram(theme: ResolvedTheme, diagram: DiagramType | undefined): ResolvedTheme {
  if (diagram === undefined) return theme;
  const ofNode = theme.nodo.diagramas?.[diagram];
  const ofGroup = theme.grupo.diagramas?.[diagram];
  const ofEdge = theme.arista.diagramas?.[diagram];
  // In sequence, the `label` of `message` is the Edge label so that its Metrics are those of the layout.
  const messageLabel = diagram === 'sequence' ? theme.secuencia?.message?.textos['label'] : undefined;
  const makesTable = diagram === 'er' && theme.nodo.capas.some((layer) => isPill(layer.primitiva.tipo));
  if (ofNode === undefined && ofGroup === undefined && ofEdge === undefined && messageLabel === undefined && !makesTable) return theme;
  const done = byDiagram.get(theme)?.get(diagram);
  if (done !== undefined) return done;
  const applyPatch = (layers: ResolvedTheme['nodo']['capas'], ops: readonly LayerOp[] | undefined, placement?: PrimitivePlacement): ResolvedTheme['nodo']['capas'] =>
    ops === undefined || ops.length === 0 ? layers : applyOps(layers as ResolvedLayer[], ops, theme.palette, 'parchear', placement).pila;
  const result: ResolvedTheme = {
    ...theme,
    nodo: { ...theme.nodo, capas: applyPatch(diagram === 'er' ? theme.nodo.capas.map(asTable) : theme.nodo.capas, ofNode?.ops), ...(ofNode?.slots !== undefined && { slots: ofNode.slots }) },
    grupo: { ...theme.grupo, capas: applyPatch(theme.grupo.capas, ofGroup?.ops), ...(ofGroup?.slots !== undefined && { slots: ofGroup.slots }), ...(ofGroup?.padding !== undefined && { padding: ofGroup.padding }) },
    arista: {
      ...theme.arista,
      capas: applyPatch(theme.arista.capas, ofEdge?.ops, 'capa-arista'),
      ...(ofEdge?.origen !== undefined && { origen: ofEdge.origen }),
      ...(ofEdge?.fin !== undefined && { fin: ofEdge.fin }),
      ...(ofEdge?.etiqueta !== undefined && { etiqueta: ofEdge.etiqueta }),
      ...(messageLabel !== undefined && { etiqueta: messageLabel }),
    },
  };
  const memo = byDiagram.get(theme) ?? new Map<DiagramType, ResolvedTheme>();
  memo.set(diagram, result);
  byDiagram.set(theme, memo);
  return result;
}

export const NEUTRAL_THEME: ResolvedTheme = {
  name: 'neutral',
  palette: {
    gray: '#6b7280',
    blue: '#2563eb',
    green: '#16a34a',
    amber: '#d97706',
    red: '#dc2626',
    purple: '#7c3aed',
  },
  fonts: { body: 'sans-serif', mono: 'monospace' },
  tokens: { background: '#ffffff', foreground: '#1f2937', border: '#9ca3af' },
  nodo: { capas: [], slots: DEFAULT_LAYOUT, textos: {}, tipos: {}, estados: {} },
  grupo: DEFAULT_GROUP,
  arista: { capas: [], fin: { tipo: 'arrow', props: { size: 8 } } },
  pagina: { capas: [], fijo: false },
};

/** Throws if the data does not meet the schema. */
export const readOps = (data: unknown): LayerOp[] => z.array(opSchema).parse(data);

const memo = new WeakMap<object, ResolvedTheme>();

/** Throws with the path of each failure if the Theme does not meet the strict schema. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  const done = memo.get(theme);
  if (done !== undefined) return done;
  const read = resolvedThemeSchema.safeParse(theme);
  if (!read.success) {
    const detail = read.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Theme '${theme.name}' does not meet the contract: ${detail}`);
  }
  const full = withDefaults(read.data);
  memo.set(theme, full);
  return full;
}

/** Fills catalog defaults for hand-written Themes; patches and `code` Layers stay as they are. */
function withDefaults(theme: ResolvedTheme): ResolvedTheme {
  const complete = <P extends { tipo: string; props: Record<string, string | number> }>(primitive: P, placement: PrimitivePlacement): P | Primitive => {
    if (primitive.tipo === 'code') return primitive;
    const props = Object.entries(primitive.props).map(([key, value]) => ({ clave: key, valor: value }));
    return buildPrimitive(primitive.tipo, props, theme.palette, placement).primitiva ?? primitive;
  };
  const layers = <C extends { primitiva: { tipo: string; props: Record<string, string | number> } }>(list: C[], placement: PrimitivePlacement): C[] => list.map((c) => ({ ...c, primitiva: complete(c.primitiva, placement) }));
  const texts = (list: Partial<Record<SlotName, Primitive>>): Partial<Record<SlotName, Primitive>> =>
    Object.fromEntries(Object.entries(list).map(([slot, primitive]) => [slot, complete(primitive, 'texto-slot')]));
  const { origen: origin, fin: end, etiqueta: label } = theme.arista;
  return {
    ...theme,
    nodo: { ...theme.nodo, capas: layers(theme.nodo.capas, 'capa-nodo'), textos: texts(theme.nodo.textos) },
    grupo: {
      ...theme.grupo,
      capas: layers(theme.grupo.capas, 'capa-nodo'),
      textos: texts(theme.grupo.textos),
      colapsado: { ...theme.grupo.colapsado, ...(theme.grupo.colapsado.textos !== undefined && { textos: texts(theme.grupo.colapsado.textos) }) },
    },
    arista: {
      ...theme.arista,
      capas: layers(theme.arista.capas, 'capa-arista'),
      ...(origin !== undefined && { origen: complete(origin, 'marcador') }),
      ...(end !== undefined && { fin: complete(end, 'marcador') }),
      ...(label !== undefined && { etiqueta: complete(label, 'etiqueta') }),
    },
    pagina: { ...theme.pagina, capas: layers(theme.pagina.capas, 'capa-pagina') },
    ...(theme.secuencia !== undefined && { secuencia: withSequenceDefaults(theme.secuencia, complete) }),
    ...(theme.fila !== undefined && { fila: { ...theme.fila, capas: layers(theme.fila.capas, 'capa-nodo'), textos: Object.fromEntries(Object.entries(theme.fila.textos).map(([name, primitive]) => [name, complete(primitive, 'texto-slot')])) } }),
  };
}

export type { SlotName };
