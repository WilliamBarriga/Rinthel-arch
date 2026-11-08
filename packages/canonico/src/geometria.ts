/**
 * Esquema Zod de la capa de geometria cacheada por Vista (spec #19, ADR 0003):
 * lo que `build` escribe en `.diagrams/geometria/<vista>.json` y lo que `export`
 * y el HTML leen de vuelta. La calcula `layout`; aqui solo se describe su forma
 * para validarla al leer del disco, sin que `canonico` dependa de `layout`.
 */
import { z } from 'zod';

const numeroFinito = z.number().finite();

const cajaDeNodoSchema = z.object({
  x: numeroFinito,
  y: numeroFinito,
  width: numeroFinito,
  height: numeroFinito,
  /** Rectangulo de cada Slot que el Tema muestra, relativo a la caja (lo coloca `tema`). */
  slots: z.record(z.string(), z.object({ x: numeroFinito, y: numeroFinito, width: numeroFinito, height: numeroFinito })).optional(),
});

const puntoSchema = z.object({ x: numeroFinito, y: numeroFinito });

/** Geometria de grafo (Vistas architecture y flow): cajas por id de Nodo, rutas por id de Arista y tamano total. */
const geometriaGrafoSchema = z.object({
  kind: z.literal('grafo'),
  nodes: z.record(z.string(), cajaDeNodoSchema),
  edges: z.record(z.string(), z.object({ points: z.array(puntoSchema) })),
  labels: z.record(z.string(), cajaDeNodoSchema).default({}),
  pinsSolapados: z.array(z.tuple([z.string(), z.string()])),
  width: numeroFinito,
  height: numeroFinito,
});

/**
 * Geometria de una Vista de secuencia: `nodes` son las cabeceras de las Lifelines (por id de Nodo, todas en la misma `y`),
 * `lifelines` la linea vertical de cada una, `activations` las barras derivadas y `messages` la ruta de cada Mensaje por su
 * identidad (`MensajeResuelto.ruta`), con la caja de su etiqueta si la tiene.
 */
const geometriaSecuenciaSchema = z.object({
  kind: z.literal('secuencia'),
  nodes: z.record(z.string(), cajaDeNodoSchema),
  lifelines: z.record(z.string(), z.object({ x: numeroFinito, y1: numeroFinito, y2: numeroFinito, destroyed: z.literal(true).optional() })),
  activations: z.array(z.object({ lifeline: z.string(), nivel: z.number().int(), x: numeroFinito, y1: numeroFinito, y2: numeroFinito, width: numeroFinito })),
  messages: z.record(z.string(), z.object({ points: z.array(puntoSchema), label: cajaDeNodoSchema.optional() })),
  fragments: z
    .array(
      z.object({
        ruta: z.string(),
        operator: z.enum(['opt', 'loop', 'break', 'critical', 'alt', 'par', 'ref']),
        title: z.object({ text: z.string(), box: cajaDeNodoSchema }).optional(),
        nivel: z.number().int(),
        x: numeroFinito,
        y: numeroFinito,
        width: numeroFinito,
        height: numeroFinito,
        tab: cajaDeNodoSchema,
        operands: z.array(z.object({ y1: numeroFinito, y2: numeroFinito, guard: z.object({ text: z.string(), box: cajaDeNodoSchema }).optional(), divider: numeroFinito.optional() })),
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        ruta: z.string(),
        anchor: z.enum(['left', 'right', 'over']),
        x: numeroFinito,
        y: numeroFinito,
        width: numeroFinito,
        height: numeroFinito,
        lines: z.array(z.string()),
        lineHeight: numeroFinito,
        fold: numeroFinito,
      }),
    )
    .default([]),
  width: numeroFinito,
  height: numeroFinito,
});

/**
 * Geometria de una Vista: union discriminada por `kind` (`grafo` o `secuencia`). Una geometria
 * escrita antes de existir `kind` se lee como `grafo`.
 */
export const geometriaSchema = z.preprocess(
  (crudo) => (typeof crudo === 'object' && crudo !== null && !('kind' in crudo) ? { ...crudo, kind: 'grafo' } : crudo),
  z.discriminatedUnion('kind', [geometriaGrafoSchema, geometriaSecuenciaSchema]),
);

/**
 * Geometria cacheada de una Vista. `layoutKey` (la `claveDeLayout` de `layout`)
 * dice con que Vista resuelta y Tema se calculo; quien la lee la compara con la
 * clave actual para saber si sigue vigente.
 */
export const geometriaCacheadaSchema = z.object({
  view: z.string().min(1),
  theme: z.string().min(1),
  layoutKey: z.string(),
  geometry: geometriaSchema,
});

export type GeometriaCacheada = z.infer<typeof geometriaCacheadaSchema>;
