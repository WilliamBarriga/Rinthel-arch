/**
 * Esquema Zod de la capa de geometria cacheada por Vista (spec #19, ADR 0004):
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
});

const puntoSchema = z.object({ x: numeroFinito, y: numeroFinito });

/** Geometria de una Vista: cajas por id de Nodo, rutas por id de Arista y tamano total. */
export const geometriaSchema = z.object({
  nodes: z.record(z.string(), cajaDeNodoSchema),
  edges: z.record(z.string(), z.object({ points: z.array(puntoSchema) })),
  pinsSolapados: z.array(z.tuple([z.string(), z.string()])),
  width: numeroFinito,
  height: numeroFinito,
});

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
