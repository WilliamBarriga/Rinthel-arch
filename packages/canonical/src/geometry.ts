/**
 * Zod schema of the Cached geometry per View (ADR 0003), in `.diagrams/geometria/<view>.json`.
 * The only declaration of the geometry's shape; `layout` computes it and re-exports these types.
 */
import { z } from 'zod';

import { NOTE_ANCHORS, FRAGMENT_OPERATORS } from './schema';

const finiteNumber = z.number().finite();

/** Box of a Node: `x`/`y` relative to its parent Group (to the canvas if it is a root). */
const nodeBoxSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber,
  height: finiteNumber,
  /** Rectangle of each Slot the Theme shows, relative to the box (placed by `tema`). */
  slots: z.record(z.string(), z.object({ x: finiteNumber, y: finiteNumber, width: finiteNumber, height: finiteNumber })).optional(),
});

const pointSchema = z.object({ x: finiteNumber, y: finiteNumber });
const edgeRouteSchema = z.object({ points: z.array(pointSchema) });

/** Graph geometry (architecture and flow Views): boxes by Node id, routes by Edge id and total size. */
const graphGeometrySchema = z.object({
  kind: z.literal('grafo'),
  nodes: z.record(z.string(), nodeBoxSchema),
  edges: z.record(z.string(), edgeRouteSchema),
  labels: z.record(z.string(), nodeBoxSchema).default({}),
  pinsSolapados: z.array(z.tuple([z.string(), z.string()])),
  width: finiteNumber,
  height: finiteNumber,
});

/**
 * Geometry of a sequence View: `nodes` are the Lifeline heads (by Node id, all at the same `y`),
 * `lifelines` the vertical line of each, `activations` the derived bars and `messages` the route of each Message by its
 * identity (`ResolvedMessage.path`), with its label box if it has one.
 */
const sequenceGeometrySchema = z.object({
  kind: z.literal('secuencia'),
  nodes: z.record(z.string(), nodeBoxSchema),
  lifelines: z.record(z.string(), z.object({ x: finiteNumber, y1: finiteNumber, y2: finiteNumber, destroyed: z.literal(true).optional() })),
  activations: z.array(z.object({ lifeline: z.string(), nivel: z.number().int(), x: finiteNumber, y1: finiteNumber, y2: finiteNumber, width: finiteNumber })),
  messages: z.record(z.string(), z.object({ points: z.array(pointSchema), label: nodeBoxSchema.optional() })),
  fragments: z
    .array(
      z.object({
        ruta: z.string(),
        operator: z.enum([...FRAGMENT_OPERATORS, 'ref']),
        title: z.object({ text: z.string(), box: nodeBoxSchema }).optional(),
        nivel: z.number().int(),
        x: finiteNumber,
        y: finiteNumber,
        width: finiteNumber,
        height: finiteNumber,
        tab: nodeBoxSchema,
        operands: z.array(z.object({ y1: finiteNumber, y2: finiteNumber, guard: z.object({ text: z.string(), box: nodeBoxSchema }).optional(), divider: finiteNumber.optional() })),
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        ruta: z.string(),
        anchor: z.enum(NOTE_ANCHORS),
        x: finiteNumber,
        y: finiteNumber,
        width: finiteNumber,
        height: finiteNumber,
        lines: z.array(z.string()),
        lineHeight: finiteNumber,
        fold: finiteNumber,
      }),
    )
    .default([]),
  groups: z
    .array(z.object({ id: z.string(), label: z.string(), nivel: z.number().int(), x: finiteNumber, y: finiteNumber, width: finiteNumber, height: finiteNumber, title: nodeBoxSchema }))
    .default([]),
  width: finiteNumber,
  height: finiteNumber,
});

/** Without `kind` it reads as `grafo`: compatibility with caches already written. */
export const geometrySchema = z.preprocess(
  (raw) => (typeof raw === 'object' && raw !== null && !('kind' in raw) ? { ...raw, kind: 'grafo' } : raw),
  z.discriminatedUnion('kind', [graphGeometrySchema, sequenceGeometrySchema]),
);

/** `layoutKey` is the `claveDeLayout` of the resolved View and the Theme; if it differs from the current one, the cache is invalid. */
export const cachedGeometrySchema = z.object({
  view: z.string().min(1),
  theme: z.string().min(1),
  layoutKey: z.string(),
  geometry: geometrySchema,
});

export type CachedGeometry = z.infer<typeof cachedGeometrySchema>;
export type NodeBox = z.infer<typeof nodeBoxSchema>;
export type Point = z.infer<typeof pointSchema>;
export type EdgeRoute = z.infer<typeof edgeRouteSchema>;
export type GraphGeometry = z.infer<typeof graphGeometrySchema>;
export type SequenceGeometry = z.infer<typeof sequenceGeometrySchema>;
export type Geometry = GraphGeometry | SequenceGeometry;
export type ActivationBox = SequenceGeometry['activations'][number];
export type MessageRoute = SequenceGeometry['messages'][string];
export type FragmentFrame = SequenceGeometry['fragments'][number];
export type PlacedOperand = FragmentFrame['operands'][number];
export type PlacedNote = SequenceGeometry['notes'][number];
export type PlacedGroupBox = SequenceGeometry['groups'][number];
