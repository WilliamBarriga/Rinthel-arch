/**
 * Esquema Zod de la salida de `inspect --json` (ADR 0005). Version independiente de `validate`: anadir
 * campos no rompe el contrato; quitarlos o cambiar su significado exige subir `INSPECT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

export const INSPECT_CONTRACT_VERSION = 2;

const sitioSchema = { file: z.string(), line: z.number().int().min(1) };

const aristaSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromAttribute: z.string().optional(),
  toAttribute: z.string().optional(),
  label: z.string().optional(),
  ...sitioSchema,
});

const resumenDeNodoSchema = z.object({ id: z.string(), type: z.string(), title: z.string(), ...sitioSchema });

const comun = { contractVersion: z.literal(INSPECT_CONTRACT_VERSION) };

/** `origen` es el parche que fijo la Capa. */
const capaDeTemaSchema = z.object({
  name: z.string(),
  primitive: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
  above: z.boolean(),
  animated: z.boolean(),
  origin: z.object(sitioSchema),
});

export const salidaDeInspectSchema = z.discriminatedUnion('command', [
  z.object({
    ...comun,
    command: z.literal('search'),
    query: z.string(),
    /** Nodos y Vistas cuyo id o titulo contiene la consulta; los ids exactos y los prefijos primero. */
    results: z.array(
      z.object({
        kind: z.enum(['node', 'view', 'interaction']),
        /** Id cualificado (Nodo) o id de la Vista. */
        id: z.string(),
        /** Tipo de nodo, o tipo de Vista (`architecture`, `flow`, `sequence` o `er`); `interaction` para una Interaccion. */
        type: z.string(),
        /** Titulo del Nodo; igual al id en una Vista, que no lo tiene. */
        title: z.string(),
        ...sitioSchema,
      }),
    ),
  }),
  z.object({
    ...comun,
    command: z.literal('node'),
    node: resumenDeNodoSchema.extend({
      description: z.string(),
      /** Id del Grupo padre; ausente en un Nodo raiz. */
      parent: z.string().optional(),
      /** Ids cualificados de los hijos directos. */
      children: z.array(z.string()),
      attributes: z.array(z.object({ name: z.string(), type: z.string(), notes: z.string() })),
    }),
    /** Aristas del Modelo en las que el Nodo es origen (`out`) o destino (`in`). */
    edges: z.array(aristaSchema.extend({ direction: z.enum(['in', 'out']) })),
    /** Vistas que muestran el Nodo (visible en su estado inicial). */
    views: z.array(z.object({ id: z.string(), ...sitioSchema })),
  }),
  z.object({
    ...comun,
    command: z.literal('view'),
    view: z.object({
      id: z.string(),
      type: z.string(),
      /** Solo en una Vista `sequence`: id de la Interaccion que proyecta. */
      interaction: z.string().optional(),
      ...sitioSchema,
      /** Nodos visibles en orden de documento (los hijos de un Grupo colapsado no salen). */
      nodes: z.array(resumenDeNodoSchema),
      /** Aristas visibles; `count` es cuantas Aristas del Modelo fusiona. */
      edges: z.array(aristaSchema.extend({ count: z.number().int().min(1) })),
    }),
  }),
  z.object({
    ...comun,
    command: z.literal('interaction'),
    interaction: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      ...sitioSchema,
      /** Items de primer nivel (Mensajes, Fragmentos, Notas y `ref`). */
      items: z.number().int().min(0),
      /** Mensajes en total, contando los de dentro de Fragmentos. */
      messages: z.number().int().min(0),
      /** Ids de las Lifelines (Nodos que participan en algun Mensaje), por primera aparicion. */
      lifelines: z.array(z.string()),
      /** Vistas `sequence` que la proyectan. */
      views: z.array(z.object({ id: z.string(), ...sitioSchema })),
    }),
  }),
  z.object({
    ...comun,
    command: z.literal('planned'),
    /** Lo planeado (ADR 0011), con la herencia aplicada; `inherited` es verdadero si no lleva la marca escrita. */
    planned: z.object({
      /** `spec` son los refs de las Source `spec` del Nodo (el documento de requisitos o diseno). */
      nodes: z.array(resumenDeNodoSchema.extend({ spec: z.array(z.string()), inherited: z.boolean() })),
      /** Solo los Atributos que llevan la marca (los de un Nodo planeado ya salen con el Nodo). */
      attributes: z.array(z.object({ node: z.string(), name: z.string(), type: z.string(), ...sitioSchema })),
      edges: z.array(aristaSchema.extend({ inherited: z.boolean() })),
      interactions: z.array(z.object({ id: z.string(), title: z.string(), ...sitioSchema })),
    }),
  }),
  z.object({
    ...comun,
    command: z.literal('theme'),
    theme: z.object({
      name: z.string(),
      /** Donde se declara; `(incorporado)` para un Tema del nucleo. */
      ...sitioSchema,
      /** Cadena `extends`, del padre hacia la raiz. */
      extends: z.array(z.string()),
      /** `part` usadas por el Tema y sus ancestros. */
      parts: z.array(z.string()),
      /** Tipo y estado pedidos para resolver la cascada, si se pidieron. */
      kind: z.string().optional(),
      state: z.string().optional(),
      /** Tipo de diagrama pedido (`--diagram`): la cascada incluye los parches `diagram <tipo>` del Tema. */
      diagram: z.string().optional(),
      /** De abajo arriba. */
      layers: z.array(capaDeTemaSchema),
      /** Fondo de pagina: pila de rellenos de abajo arriba y si queda fijo al visor. */
      page: z.object({ fixed: z.boolean(), layers: z.array(capaDeTemaSchema) }),
      /**
       * Grupo del Tipo y estado pedidos; pilas de abajo arriba, `padding` de la zona de hijos. `propio` es falso si el
       * Tema no declara `group`: las Capas salen vacias y el dibujo usa un Grupo sobrio derivado de los tokens del Tema.
       */
      group: z.object({
        own: z.boolean(),
        header: z.string(),
        /** Donde se escribio la cabecera (`slots` de `group`); el Tema si ninguno la escribe. */
        headerOrigin: z.object(sitioSchema),
        headerHeight: z.number(),
        padding: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
        layers: z.array(capaDeTemaSchema),
        collapsed: z.object({ slots: z.string(), slotsOrigin: z.object(sitioSchema), layers: z.array(capaDeTemaSchema) }),
      }),
      /** Disposicion de Slots del Nodo del Tipo pedido, en la sintaxis del DSL (`column { row gap 6 { icon title } attrs }`). */
      slots: z.string(),
      /** Donde se escribio esa disposicion (`slots` de `node`); el Tema si ninguno la escribe. */
      slotsOrigin: z.object(sitioSchema),
      /** Metricas del Nodo del Tipo pedido (o la base): lo unico que mueve el layout. */
      metrics: z.object({ fontSize: z.number() }).catchall(z.unknown()),
      hasCode: z.boolean(),
      components: z.array(z.string()),
      /**
       * Elementos de secuencia y fila ER (`row`), resueltos como en el dibujo. Sin `--diagram`, solo los que el Tema
       * declara; con `--diagram sequence` o `er`, tambien los derivados de `edge` y `node` (`derived: true`).
       * Ausente si no hay ninguno.
       */
      elements: z
        .object({
          sequence: z
            .record(
              z.string(),
              z.object({
                layers: z.array(capaDeTemaSchema),
                markers: z.record(z.string(), z.string()),
                patches: z.record(z.string(), z.array(capaDeTemaSchema)),
                metrics: z.record(z.string(), z.number()),
                derived: z.literal(true).optional(),
              }),
            )
            .optional(),
          row: z.object({ height: z.number().optional(), layers: z.array(capaDeTemaSchema), derived: z.literal(true).optional() }).optional(),
        })
        .optional(),
      /** Con `--catalog`: claves del catalogo de Primitivas, Movimientos y efectos. */
      catalog: z.object({ primitives: z.array(z.string()), motions: z.array(z.string()), effects: z.array(z.string()) }).optional(),
    }),
  }),
]);

export type SalidaDeInspect = z.infer<typeof salidaDeInspectSchema>;

export function salidaDeInspectJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(salidaDeInspectSchema);
}
