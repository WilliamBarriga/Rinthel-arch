/**
 * Zod schema of the Canonical form. Qualified ids (`a.b.c`) define the Model hierarchy; a nested
 * document (`children`) and a flat one are valid if they say the same thing (see `modelFindings`).
 */
import { z } from 'zod';

/** `a.b.c` segments of `[A-Za-z0-9_-]`; rejects empty ids, spaces and empty segments (`a..b`, `api.`, `.api`). */
export const nodeIdSchema = z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/, {
  message: 'id qualified by hierarchy: segments a.b.c',
});

const kindNameSchema = z.string().min(1);

/** `color` is a Palette name, never a literal value; `icon` is an opaque key of the `IconProvider`. */
export const nodeKindSchema = z.object({
  name: kindNameSchema,
  description: z.string().default(''),
  icon: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

export type NodeKind = z.infer<typeof nodeKindSchema>;

export interface NodeKindCatalog {
  nodeTypes: NodeKind[];
}

export interface Node {
  id: string;
  type: string;
  title: string;
  description: string;
  attributes: Attribute[];
  source: OpaqueReference[];
  children: Node[];
  /** Planned mark (ADR 0011): proposed, not built yet; marks its descendants. Absent is `false`. */
  planned?: boolean;
}

/** Reference to something external to the Model; the core does not interpret `kind` or `ref`. */
export interface OpaqueReference {
  kind: string;
  ref: string;
}

/** ER key marks, combinable. */
export const ATTRIBUTE_KEYS = ['pk', 'fk', 'uk'] as const;
/** The ones an ER View requires; the Model stores free text. */
export const ER_CARDINALITIES = ['0..1', '1', '0..*', '1..*'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** Column, field or method of a Node; not a child Node. `keys` and `optional` are only drawn in ER Views. */
export interface Attribute {
  name: string;
  type: string;
  notes: string;
  /** No repeats; absent if it has none. */
  keys?: AttributeKey[];
  /** The type allows null (`type?` in the DSL); absent is `false`. */
  optional?: boolean;
  /** Planned mark (ADR 0011), drawn as a chip next to the key ones; absent is `false`. */
  planned?: boolean;
}

/** `node` is the full qualified id; `attribute` is written `node#attribute` (the dot is only hierarchy). */
export interface Endpoint {
  node: string;
  attribute?: string;
}

export interface Edge {
  from: Endpoint;
  to: Endpoint;
  fromCardinality?: string;
  toCardinality?: string;
  label?: string;
  /** ER: solid line instead of dashed; absent is `false`. */
  identifying?: boolean;
  /** Planned mark (ADR 0011); an Edge is also drawn planned if one of its ends is. Absent is `false`. */
  planned?: boolean;
}

export interface Model {
  nodes: Node[];
  edges: Edge[];
  interactions?: Interaction[];
}

export const MESSAGE_KINDS = ['sync', 'async', 'reply', 'create', 'destroy'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** `from == to` is a self Message. Its identity is the position; `id` is an optional alias, unique in its Interaction. */
export interface Message {
  type: 'message';
  id?: string;
  kind: MessageKind;
  from: string;
  to: string;
  label?: string;
  description?: string;
}

/** `opt loop break critical` take one operand; `alt par`, one or more. */
export const FRAGMENT_OPERATORS = ['opt', 'loop', 'break', 'critical', 'alt', 'par'] as const;
export type FragmentOperator = (typeof FRAGMENT_OPERATORS)[number];

/**
 * `separator` is the word that introduced the operand (`else` in `alt`, `and` in `par`); the first one does not carry it.
 * Only `validate` uses it, to detect crossed operands.
 */
export interface Operand {
  guard?: string;
  separator?: 'else' | 'and';
  items: InteractionItem[];
}

/** Fragment: operator with operands; nestable. Not a Node or a Group: its Lifelines are derived from its content. */
export interface Fragment {
  type: 'fragment';
  operator: FragmentOperator;
  operands: Operand[];
}

/** Anchor of a Note: to the left or right of a Lifeline, or over one or two. */
export const NOTE_ANCHORS = ['left', 'right', 'over'] as const;
export type NoteAnchor = (typeof NOTE_ANCHORS)[number];

/** `left of X`, `right of X` (one target) or `over X[, Y]` (one or two). Not a participant. */
export interface Note {
  type: 'note';
  anchor: NoteAnchor;
  targets: string[];
  text: string;
}

/** `ref <interaction>`: reference to another Interaction (cycles are valid; it is not expanded). */
export interface Reference {
  type: 'ref';
  interaction: string;
}

/** Item of an Interaction; declaration order is temporal order. */
export type InteractionItem = Message | Fragment | Note | Reference;

/** Ordered scenario between Nodes (Lifelines); id in its own namespace (it may match a Node's). */
export interface Interaction {
  id: string;
  title: string;
  description: string;
  items: InteractionItem[];
  /** Planned mark (ADR 0011): all its Messages are drawn planned. Absent is `false`. */
  planned?: boolean;
}

const opaqueReferenceSchema = z.object({ kind: z.string().min(1), ref: z.string() });

export const attributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  notes: z.string().default(''),
  keys: z.array(z.enum(ATTRIBUTE_KEYS)).min(1).optional(),
  optional: z.boolean().optional(),
  planned: z.boolean().optional(),
});

/** Whether `type` is in the catalog is checked in `canonicalSourceSchema`, where the catalog lives. */
export const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: nodeIdSchema,
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(''),
    attributes: z.array(attributeSchema).default([]),
    source: z.array(opaqueReferenceSchema).default([]),
    children: z.array(nodeSchema).default([]),
    planned: z.boolean().optional(),
  }),
);

const catalogSchema = z.object({
  nodeTypes: z.array(nodeKindSchema),
});

const endpointSchema = z.object({ node: nodeIdSchema, attribute: z.string().min(1).optional() });

export const edgeSchema = z.object({
  from: endpointSchema,
  to: endpointSchema,
  fromCardinality: z.string().min(1).optional(),
  toCardinality: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  identifying: z.boolean().optional(),
  planned: z.boolean().optional(),
});

export const messageSchema = z.object({
  type: z.literal('message'),
  id: z.string().min(1).optional(),
  kind: z.enum(MESSAGE_KINDS).default('sync'),
  from: nodeIdSchema,
  to: nodeIdSchema,
  label: z.string().optional(),
  description: z.string().optional(),
});

export const fragmentSchema: z.ZodType<Fragment> = z.lazy(() =>
  z.object({
    type: z.literal('fragment'),
    operator: z.enum(FRAGMENT_OPERATORS),
    operands: z.array(
      z.object({
        guard: z.string().optional(),
        separator: z.enum(['else', 'and']).optional(),
        items: z.array(itemSchema).default([]),
      }),
    ),
  }),
) as z.ZodType<Fragment>;

export const noteSchema = z.object({
  type: z.literal('note'),
  anchor: z.enum(NOTE_ANCHORS),
  targets: z.array(nodeIdSchema).min(1),
  text: z.string(),
});

export const referenceSchema = z.object({ type: z.literal('ref'), interaction: z.string().min(1) });

const itemSchema: z.ZodType<InteractionItem> = z.lazy(() => z.union([messageSchema, fragmentSchema, noteSchema, referenceSchema]));

export const interactionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  items: z.array(itemSchema).default([]),
  planned: z.boolean().optional(),
});

const modelSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).default([]),
  interactions: z.array(interactionSchema).default([]),
});

/** Envelope of the already resolved Theme; the rest of the content passes through as is and the `theme` package validates it. */
export const themeSchema = z.looseObject({
  name: z.string().min(1),
  palette: z.record(z.string(), z.string()).default({}),
});

export type Theme = z.infer<typeof themeSchema>;

export const VIEW_TYPES = ['architecture', 'flow', 'sequence', 'er'] as const;

/**
 * Appearance only, never touches the Model. `pin`: center of the Node relative to its parent Group (to the canvas if root),
 * applied after layout. `order` is stored but has no effect: ELK runs without `considerModelOrder`.
 * `color` is a Palette name.
 */
export const overrideSchema = z.object({
  node: nodeIdSchema,
  label: z.string().optional(),
  pin: z.object({ x: z.number(), y: z.number() }).optional(),
  order: z.number().int().optional(),
  color: z.string().min(1).optional(),
});

export type NodeOverride = z.infer<typeof overrideSchema>;

/** Selector of Nodes (`a.*` and `a.**` include the Group `a`) or of an Edge (`a -> b`). */
const stepElementSchema = z.union([
  z.object({ selector: z.string().min(1) }),
  z.object({ from: nodeIdSchema, to: nodeIdSchema }),
]);

/** Cumulative: `show` reveals and `hide` hides what came before. */
export const stepSchema = z.object({
  title: z.string(),
  show: z.array(stepElementSchema).default([]),
  hide: z.array(stepElementSchema).default([]),
  /** Only `sequence`: id of the Message up to which (inclusive) the Interaction is shown. */
  upto: z.string().min(1).optional(),
});

export type Step = z.infer<typeof stepSchema>;
export type StepElement = z.infer<typeof stepElementSchema>;
export type StepEdge = Extract<StepElement, { from: string }>;

/** Selects Nodes of the Model (see `resolveView`); never defines entities. */
export const viewSchema = z.object({
  id: z.string().min(1),
  type: z.enum(VIEW_TYPES),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  depth: z.number().int().min(0).optional(),
  /** Only `sequence`: id in `model.interactions`. */
  interaction: z.string().min(1).optional(),
  /** Only `sequence`: partial order of the Lifelines; the rest follow by first appearance. */
  order: z.array(nodeIdSchema).default([]),
  /** Only `sequence`: the number goes into the Message label. Absent = false. */
  autonumber: z.literal(true).optional(),
  overrides: z.array(overrideSchema).default([]),
  theme: z.string().min(1).optional(),
  /** Layer patches by name (`theme t { layer ... }`), last level of the cascade; `theme` validates them. */
  themePatch: z.array(z.looseObject({ nombre: z.string().min(1) })).optional(),
  drill: z.literal('collapse').optional(),
  /** They win over the `depth` rule. */
  collapsed: z.array(nodeIdSchema).default([]),
  expanded: z.array(nodeIdSchema).default([]),
  /** The linked Group is not expanded. */
  links: z.array(z.object({ node: nodeIdSchema, view: z.string().min(1) })).default([]),
  /** Without Steps everything is revealed. */
  steps: z.array(stepSchema).default([]),
  /** Only `sequence`: one Step per projected Message. Absent = false. */
  stepsEach: z.literal(true).optional(),
});

export type View = z.infer<typeof viewSchema>;

/** Only shape and structural rules (`modelFindings`); semantic validation is `validate`. */
export const canonicalFormSchema = z
  .object({
    specification: catalogSchema,
    model: modelSchema,
    views: z.array(viewSchema).default([]),
    themes: z.array(themeSchema).default([]),
  })
  .superRefine((source, ctx) => {
    for (const finding of modelFindings(source)) {
      ctx.addIssue({ code: 'custom', path: finding.path, message: finding.message });
    }
  });

export type CanonicalForm = z.infer<typeof canonicalFormSchema>;

interface Finding {
  path: (string | number)[];
  message: string;
}

/**
 * Hierarchy consistent with the ids (no orphan children), `type` in the catalog and existing Edge ends
 * (Node and, if it carries one, Attribute).
 */
function modelFindings(source: {
  specification: NodeKindCatalog;
  model: Model;
}): Finding[] {
  const types = new Set(source.specification.nodeTypes.map((kind) => kind.name));

  const ids = new Map<string, Set<string>>();
  collectIds(source.model.nodes, ids);

  const findings: Finding[] = [];
  const walk = (
    nodes: Node[],
    container: string | undefined,
    path: (string | number)[],
  ): void => {
    nodes.forEach((node, index) => {
      const here = [...path, index];
      const parent = parentOf(node.id);

      if (!types.has(node.type)) {
        findings.push({
          path: [...here, 'type'],
          message: `Node kind '${node.type}' is not declared in the catalog`,
        });
      }

      if (parent !== '' && !ids.has(parent)) {
        findings.push({
          path: here,
          message: `Orphan child: parent '${parent}' of Node '${node.id}' does not exist in the Model`,
        });
      } else if (container !== undefined && container !== parent) {
        findings.push({
          path: here,
          message: `Inconsistent hierarchy: '${node.id}' is nested under '${container}' but its parent is '${parent || 'none'}'`,
        });
      }

      walk(node.children, node.id, [...here, 'children']);
    });
  };
  walk(source.model.nodes, undefined, ['model', 'nodes']);

  source.model.edges.forEach((edge, index) => {
    for (const side of ['from', 'to'] as const) {
      const { node, attribute } = edge[side];
      const attributes = ids.get(node);
      if (attributes === undefined) {
        findings.push({
          path: ['model', 'edges', index, side, 'node'],
          message: `Dangling Edge: Node '${node}' does not exist in the Model`,
        });
      } else if (attribute !== undefined && !attributes.has(attribute)) {
        findings.push({
          path: ['model', 'edges', index, side, 'attribute'],
          message: `Node '${node}' has no Attribute '${attribute}'`,
        });
      }
    }
  });

  return findings;
}

function collectIds(nodes: Node[], target: Map<string, Set<string>>): void {
  for (const node of nodes) {
    target.set(node.id, new Set(node.attributes.map((attribute) => attribute.name)));
    collectIds(node.children, target);
  }
}

/** Empty string if the id is a root. */
export function parentOf(id: string): string {
  const cut = id.lastIndexOf('.');
  return cut === -1 ? '' : id.slice(0, cut);
}
