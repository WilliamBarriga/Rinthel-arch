/**
 * Intenciones de edicion (`POST /api/edit`, ADR 0005 y 0007) y motivos de rechazo de `sesion`.
 * Unica declaracion: el enum `reason` de `salidaDeEditSchema` deriva de `MOTIVOS_DE_RECHAZO`.
 */
import { z } from 'zod';

/** El servidor calcula el texto del DSL; el llamador no conoce la sintaxis. */
export const intencionDePinSchema = z.object({
  vista: z.string(),
  /** Id cualificado del Nodo. */
  nodo: z.string(),
  /** Relativa al Grupo padre, como `pin x,y` en el DSL. */
  x: z.number().finite(),
  y: z.number().finite(),
});

export type IntencionDePin = z.infer<typeof intencionDePinSchema>;

/** Mismo orden que el enum `reason` del contrato. */
export const MOTIVOS_DE_RECHAZO = [
  'hash-desactualizado',
  'archivo-desconocido',
  'rango-invalido',
  'ediciones-solapadas',
  'vista-desconocida',
  'invalida',
  'nada-que-deshacer',
  'nada-que-rehacer',
  'tema-desconocido',
] as const;

export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

/**
 * `orden`: ids de todas las Lifelines visibles, de izquierda a derecha. Las entradas ocultas de `order`
 * conservan su posicion relativa.
 */
export const intencionDeOrdenSchema = z.object({
  vista: z.string(),
  orden: z.array(z.string()).min(1),
});

export type IntencionDeOrden = z.infer<typeof intencionDeOrdenSchema>;

/**
 * Fija el Tema de una Vista (`theme <tema>` conservando el parche); sin `tema` quita el fijado. Un Tema no declarado
 * rechaza con `tema-desconocido`.
 */
export const intencionDeTemaSchema = z.object({
  vista: z.string(),
  tema: z.string().min(1).optional(),
});

export type IntencionDeTema = z.infer<typeof intencionDeTemaSchema>;

/** Cuerpo de `POST /api/edit`, discriminado por `tipo`. */
export const intencionSchema = z.discriminatedUnion('tipo', [
  intencionDePinSchema.extend({ tipo: z.literal('mover-pin') }),
  intencionDeOrdenSchema.extend({ tipo: z.literal('ordenar-lifelines') }),
  intencionDeTemaSchema.extend({ tipo: z.literal('fijar-tema') }),
]);

export type Intencion = z.infer<typeof intencionSchema>;
