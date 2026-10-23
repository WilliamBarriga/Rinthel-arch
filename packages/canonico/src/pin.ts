/**
 * Vocabulario del Gesto de editar un Pin (ADR 0005): `IntencionDePin` es el cuerpo
 * de `POST /api/pin` que consumen `sesion` (via `editarPin`), `shell` (el cliente
 * del endpoint) y el servidor de `dev` (que lo valida con
 * `intencionDePinSchema`); `MotivoDeRechazo` es el motivo con el que `sesion`
 * rechaza la edicion y que la salida de `edit`/`dev` salta al llamador;
 * `MOTIVOS_DE_RECHAZO` alimenta la salida de `edit` (el enum `reason` de
 * `salidaDeEditSchema` se deriva de el). Se declaran una sola vez aqui: el
 * compilador empareja a los llamadores y un motivo nuevo es una sola edicion.
 */
import { z } from 'zod';

/** Intencion de mover un Pin: el servidor calcula el texto; el llamador no conoce la sintaxis. */
export const intencionDePinSchema = z.object({
  vista: z.string(),
  /** Id cualificado del Nodo. */
  nodo: z.string(),
  /** Coordenada relativa al Grupo padre, como la escribe el DSL del `pin x,y`. */
  x: z.number().finite(),
  y: z.number().finite(),
  /** `hashDeContenido` del archivo que contiene la Vista, tal como lo vio el llamador. */
  hash: z.string(),
});

export type IntencionDePin = z.infer<typeof intencionDePinSchema>;

/** Motivos con los que `sesion` rechaza una edicion estructurada (mismo orden que el contrato). */
export const MOTIVOS_DE_RECHAZO = [
  'hash-desactualizado',
  'archivo-desconocido',
  'rango-invalido',
  'ediciones-solapadas',
  'vista-desconocida',
  'invalida',
  'nada-que-deshacer',
  'nada-que-rehacer',
] as const;

export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

/**
 * Union de Intenciones de edicion (ADR 0007), discriminada por `tipo`: el cuerpo de
 * `POST /api/edit`. Una Intencion nueva es una variante mas aqui; el endpoint no cambia.
 */
export const intencionSchema = z.discriminatedUnion('tipo', [intencionDePinSchema.extend({ tipo: z.literal('mover-pin') })]);

export type Intencion = z.infer<typeof intencionSchema>;
