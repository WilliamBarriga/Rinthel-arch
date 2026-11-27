/**
 * Zod schema of the `inspect --json` output (ADR 0005). Version independent of `validate`'s: adding
 * fields does not break the contract; removing them or changing their meaning requires bumping `INSPECT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

export const INSPECT_CONTRACT_VERSION = 2;

const siteSchema = { file: z.string(), line: z.number().int().min(1) };

const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromAttribute: z.string().optional(),
  toAttribute: z.string().optional(),
  label: z.string().optional(),
  ...siteSchema,
});

const nodeSummarySchema = z.object({ id: z.string(), type: z.string(), title: z.string(), ...siteSchema });

const common = { contractVersion: z.literal(INSPECT_CONTRACT_VERSION) };

/** `origin` is the patch that set the Layer. */
const themeLayerSchema = z.object({
  name: z.string(),
  primitive: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
  above: z.boolean(),
  animated: z.boolean(),
  origin: z.object(siteSchema),
});

export const inspectOutputSchema = z.discriminatedUnion('command', [
  z.object({
    ...common,
    command: z.literal('search'),
    query: z.string(),
    /** Nodes and Views whose id or title contains the query; exact ids and prefixes first. */
    results: z.array(
      z.object({
        kind: z.enum(['node', 'view', 'interaction']),
        /** Qualified id (Node) or View id. */
        id: z.string(),
        /** Node kind, or Diagram type of a View (`architecture`, `flow`, `sequence` or `er`); `interaction` for an Interaction. */
        type: z.string(),
        /** Node title; equal to the id for a View, which has none. */
        title: z.string(),
        ...siteSchema,
      }),
    ),
  }),
  z.object({
    ...common,
    command: z.literal('node'),
    node: nodeSummarySchema.extend({
      description: z.string(),
      /** Id of the parent Group; absent for a root Node. */
      parent: z.string().optional(),
      /** Qualified ids of the direct children. */
      children: z.array(z.string()),
      attributes: z.array(z.object({ name: z.string(), type: z.string(), notes: z.string() })),
    }),
    /** Model Edges where the Node is the source (`out`) or the target (`in`). */
    edges: z.array(edgeSchema.extend({ direction: z.enum(['in', 'out']) })),
    /** Views that show the Node (visible in their initial state). */
    views: z.array(z.object({ id: z.string(), ...siteSchema })),
  }),
  z.object({
    ...common,
    command: z.literal('view'),
    view: z.object({
      id: z.string(),
      type: z.string(),
      /** Only in a `sequence` View: id of the Interaction it projects. */
      interaction: z.string().optional(),
      ...siteSchema,
      /** Visible Nodes in document order (the children of a Collapsed group are left out). */
      nodes: z.array(nodeSummarySchema),
      /** Visible Edges; `count` is how many Model Edges it merges. */
      edges: z.array(edgeSchema.extend({ count: z.number().int().min(1) })),
    }),
  }),
  z.object({
    ...common,
    command: z.literal('interaction'),
    interaction: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      ...siteSchema,
      /** Top-level items (Messages, Fragments, Notes and `ref`). */
      items: z.number().int().min(0),
      /** Total Messages, counting those inside Fragments. */
      messages: z.number().int().min(0),
      /** Ids of the Lifelines (Nodes that take part in some Message), by first appearance. */
      lifelines: z.array(z.string()),
      /** `sequence` Views that project it. */
      views: z.array(z.object({ id: z.string(), ...siteSchema })),
    }),
  }),
  z.object({
    ...common,
    command: z.literal('planned'),
    /** What is planned (ADR 0011), with inheritance applied; `inherited` is true if it does not carry the written mark. */
    planned: z.object({
      /** `spec` are the refs of the Node's `spec` Sources (the requirements or design document). */
      nodes: z.array(nodeSummarySchema.extend({ spec: z.array(z.string()), inherited: z.boolean() })),
      /** Only the Attributes that carry the mark (those of a planned Node already come with the Node). */
      attributes: z.array(z.object({ node: z.string(), name: z.string(), type: z.string(), ...siteSchema })),
      edges: z.array(edgeSchema.extend({ inherited: z.boolean() })),
      interactions: z.array(z.object({ id: z.string(), title: z.string(), ...siteSchema })),
    }),
  }),
  z.object({
    ...common,
    command: z.literal('theme'),
    theme: z.object({
      name: z.string(),
      /** Where it is declared; `<built-in>` for a core Theme. */
      ...siteSchema,
      /** `extends` chain, from the parent towards the root. */
      extends: z.array(z.string()),
      /** `part`s used by the Theme and its ancestors. */
      parts: z.array(z.string()),
      /** Node kind and state requested to resolve the cascade, if requested. */
      kind: z.string().optional(),
      state: z.string().optional(),
      /** Requested Diagram type (`--diagram`): the cascade includes the Theme's `diagram <type>` patches. */
      diagram: z.string().optional(),
      /** Bottom to top. */
      layers: z.array(themeLayerSchema),
      /** Page background: stack of fills from bottom to top and whether it stays fixed to the viewer. */
      page: z.object({ fixed: z.boolean(), layers: z.array(themeLayerSchema) }),
      /**
       * Group of the requested Node kind and state; stacks from bottom to top, `padding` of the children area. `own` is false
       * if the Theme does not declare `group`: the Layers come out empty and the drawing uses a plain Group derived from the Theme tokens.
       */
      group: z.object({
        own: z.boolean(),
        header: z.string(),
        /** Where the header was written (`slots` of `group`); the Theme if none writes it. */
        headerOrigin: z.object(siteSchema),
        headerHeight: z.number(),
        padding: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
        layers: z.array(themeLayerSchema),
        collapsed: z.object({ slots: z.string(), slotsOrigin: z.object(siteSchema), layers: z.array(themeLayerSchema) }),
      }),
      /** Slot layout of the Node of the requested Node kind, in DSL syntax (`column { row gap 6 { icon title } attrs }`). */
      slots: z.string(),
      /** Where that layout was written (`slots` of `node`); the Theme if none writes it. */
      slotsOrigin: z.object(siteSchema),
      /** Metrics of the Node of the requested Node kind (or the base): the only thing that moves the layout. */
      metrics: z.object({ fontSize: z.number() }).catchall(z.unknown()),
      hasCode: z.boolean(),
      components: z.array(z.string()),
      /**
       * Sequence elements and ER row (`row`), resolved as in the drawing. Without `--diagram`, only those the Theme
       * declares; with `--diagram sequence` or `er`, also those derived from `edge` and `node` (`derived: true`).
       * Absent if there are none.
       */
      elements: z
        .object({
          sequence: z
            .record(
              z.string(),
              z.object({
                layers: z.array(themeLayerSchema),
                markers: z.record(z.string(), z.string()),
                patches: z.record(z.string(), z.array(themeLayerSchema)),
                metrics: z.record(z.string(), z.number()),
                derived: z.literal(true).optional(),
              }),
            )
            .optional(),
          row: z.object({ height: z.number().optional(), layers: z.array(themeLayerSchema), derived: z.literal(true).optional() }).optional(),
        })
        .optional(),
      /** With `--catalog`: keys of the catalog of Primitives, Motions and Effects. */
      catalog: z.object({ primitives: z.array(z.string()), motions: z.array(z.string()), effects: z.array(z.string()) }).optional(),
    }),
  }),
]);

export type InspectOutput = z.infer<typeof inspectOutputSchema>;

export function inspectOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(inspectOutputSchema);
}
