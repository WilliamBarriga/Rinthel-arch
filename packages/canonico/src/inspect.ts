/**
 * Esquema Zod de la salida de `inspect --json` (ADR 0005). Es la fuente del
 * contrato: el CLI lo usa para emitir y el skill generado para describirlo. Su
 * version es independiente de la de `validate` (ADR 0005): anadir campos no
 * rompe el contrato; quitarlos o cambiar su significado exige subir
 * `INSPECT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

/** Version entera del contrato de `inspect`, independiente de `CONTRACT_VERSION` (validate). */
export const INSPECT_CONTRACT_VERSION = 1;

/** Donde se escribio algo: `archivo:linea` segun el Ubicador. */
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

/** Capa de una pila de Tema ya resuelta; `origen` es el parche que la fijo. */
const capaDeTemaSchema = z.object({
  nombre: z.string(),
  primitiva: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
  encima: z.boolean(),
  animada: z.boolean(),
  origen: z.object(sitioSchema),
});

export const salidaDeInspectSchema = z.discriminatedUnion('comando', [
  z.object({
    ...comun,
    comando: z.literal('buscar'),
    consulta: z.string(),
    /** Nodos y Vistas cuyo id o titulo contiene la consulta; los ids exactos y los prefijos primero. */
    resultados: z.array(
      z.object({
        kind: z.enum(['nodo', 'vista']),
        /** Id cualificado (Nodo) o id de la Vista. */
        id: z.string(),
        /** Tipo de nodo, o tipo de Vista (`architecture` o `flow`). */
        type: z.string(),
        /** Titulo del Nodo; igual al id en una Vista, que no lo tiene. */
        title: z.string(),
        ...sitioSchema,
      }),
    ),
  }),
  z.object({
    ...comun,
    comando: z.literal('nodo'),
    nodo: resumenDeNodoSchema.extend({
      description: z.string(),
      /** Id del Grupo padre; ausente en un Nodo raiz. */
      parent: z.string().optional(),
      /** Ids cualificados de los hijos directos. */
      children: z.array(z.string()),
      attributes: z.array(z.object({ name: z.string(), type: z.string(), notes: z.string() })),
    }),
    /** Aristas del Modelo en las que el Nodo es origen (`out`) o destino (`in`). */
    aristas: z.array(aristaSchema.extend({ direction: z.enum(['in', 'out']) })),
    /** Vistas que muestran el Nodo (visible en su estado inicial). */
    vistas: z.array(z.object({ id: z.string(), ...sitioSchema })),
  }),
  z.object({
    ...comun,
    comando: z.literal('vista'),
    vista: z.object({
      id: z.string(),
      type: z.string(),
      ...sitioSchema,
      /** Nodos visibles en orden de documento (los hijos de un Grupo colapsado no salen). */
      nodos: z.array(resumenDeNodoSchema),
      /** Aristas visibles; `count` es cuantas Aristas del Modelo fusiona. */
      aristas: z.array(aristaSchema.extend({ count: z.number().int().min(1) })),
    }),
  }),
  z.object({
    ...comun,
    comando: z.literal('tema'),
    tema: z.object({
      name: z.string(),
      /** Donde se declara; `(incorporado)` para un Tema del nucleo. */
      ...sitioSchema,
      /** Cadena `extends`, del padre hacia la raiz. */
      extends: z.array(z.string()),
      /** `part` usadas por el Tema y sus ancestros. */
      partes: z.array(z.string()),
      /** Tipo y estado pedidos para resolver la cascada, si se pidieron. */
      tipo: z.string().optional(),
      estado: z.string().optional(),
      /** Pila de Capas resuelta, de abajo arriba; `origen` es el parche que la fijo. */
      capas: z.array(capaDeTemaSchema),
      /** Fondo de pagina: pila de rellenos de abajo arriba y si queda fijo al visor. */
      pagina: z.object({ fijo: z.boolean(), capas: z.array(capaDeTemaSchema) }),
      /** Disposicion de Slots del Nodo del Tipo pedido, en la sintaxis del DSL (`column { row gap 6 { icon title } attrs }`). */
      slots: z.string(),
      /** Metricas del Nodo del Tipo pedido (o la base): lo unico que mueve el layout. */
      metricas: z.object({ fontSize: z.number() }).catchall(z.unknown()),
      temaConCodigo: z.boolean(),
      componentes: z.array(z.string()),
      /** Con `--catalogo`: claves del catalogo de Primitivas, Movimientos y efectos. */
      catalogo: z.object({ primitivas: z.array(z.string()), movimientos: z.array(z.string()), efectos: z.array(z.string()) }).optional(),
    }),
  }),
]);

export type SalidaDeInspect = z.infer<typeof salidaDeInspectSchema>;

/** El contrato de `inspect --json` como JSON Schema, derivado del esquema Zod. */
export function salidaDeInspectJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(salidaDeInspectSchema);
}
