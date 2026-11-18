/**
 * Esquema Zod de la capa de geometria cacheada por Vista (spec #19, ADR 0003):
 * lo que `build` escribe en `.diagrams/geometria/<vista>.json` y lo que `export`
 * y el HTML leen de vuelta. Es la unica declaracion de la forma de la Geometria:
 * `layout` la calcula y reexporta estos tipos, que salen del esquema.
 */
import { z } from 'zod';

import { ANCLAJES_DE_NOTA, OPERADORES_DE_FRAGMENTO } from './esquema';

const numeroFinito = z.number().finite();

/** Caja de un Nodo: `x`/`y` relativos a su Grupo padre (al lienzo si es raiz). */
const cajaDeNodoSchema = z.object({
  x: numeroFinito,
  y: numeroFinito,
  width: numeroFinito,
  height: numeroFinito,
  /** Rectangulo de cada Slot que el Tema muestra, relativo a la caja (lo coloca `tema`). */
  slots: z.record(z.string(), z.object({ x: numeroFinito, y: numeroFinito, width: numeroFinito, height: numeroFinito })).optional(),
});

const puntoSchema = z.object({ x: numeroFinito, y: numeroFinito });
const rutaDeAristaSchema = z.object({ points: z.array(puntoSchema) });

/** Geometria de grafo (Vistas architecture y flow): cajas por id de Nodo, rutas por id de Arista y tamano total. */
const geometriaGrafoSchema = z.object({
  kind: z.literal('grafo'),
  nodes: z.record(z.string(), cajaDeNodoSchema),
  edges: z.record(z.string(), rutaDeAristaSchema),
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
        operator: z.enum([...OPERADORES_DE_FRAGMENTO, 'ref']),
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
        anchor: z.enum(ANCLAJES_DE_NOTA),
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
  groups: z
    .array(z.object({ id: z.string(), label: z.string(), nivel: z.number().int(), x: numeroFinito, y: numeroFinito, width: numeroFinito, height: numeroFinito, title: cajaDeNodoSchema }))
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
export type CajaDeNodo = z.infer<typeof cajaDeNodoSchema>;
export type Punto = z.infer<typeof puntoSchema>;
export type RutaDeArista = z.infer<typeof rutaDeAristaSchema>;
export type GeometriaGrafo = z.infer<typeof geometriaGrafoSchema>;
export type GeometriaSecuencia = z.infer<typeof geometriaSecuenciaSchema>;
/** Geometria calculada de una Vista: union por `kind`; quien la lee hace switch por `kind`. */
export type Geometria = GeometriaGrafo | GeometriaSecuencia;
export type CajaDeActivacion = GeometriaSecuencia['activations'][number];
export type RutaDeMensaje = GeometriaSecuencia['messages'][string];
export type MarcoDeFragmento = GeometriaSecuencia['fragments'][number];
export type OperandoColocado = MarcoDeFragmento['operands'][number];
export type NotaColocada = GeometriaSecuencia['notes'][number];
export type CajaDeGrupoColocada = GeometriaSecuencia['groups'][number];
