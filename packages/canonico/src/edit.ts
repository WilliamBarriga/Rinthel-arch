/**
 * Esquema Zod de la salida de `edit --json` (ADR 0005). Fuente del contrato: el CLI
 * lo usa para emitir y el skill generado para describirlo. Su version es independiente
 * de las de `validate` e `inspect`: anadir campos no rompe el contrato; quitarlos o
 * cambiar su significado exige subir `EDIT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

import { MOTIVOS_DE_RECHAZO } from './pin';

export const EDIT_CONTRACT_VERSION = 1;

const posicionSchema = z.object({ line: z.number().int().min(1), column: z.number().int().min(1) });

/** Edicion de texto `{ file, range, replacement }`; el rango es 1-based con fin excluido. */
export const edicionDeTextoSchema = z.object({
  file: z.string(),
  range: z.object({ start: posicionSchema, end: posicionSchema }),
  replacement: z.string(),
});

/** Entrada de `edit --edits`: ediciones de texto con el hash opcional del archivo que vio quien las pide. */
export const edicionesPedidasSchema = z.array(edicionDeTextoSchema.extend({ hash: z.string().optional() })).min(1);

const comun = { contractVersion: z.literal(EDIT_CONTRACT_VERSION) };

export const salidaDeEditSchema = z.discriminatedUnion('ok', [
  z.object({
    ...comun,
    ok: z.literal(true),
    /** Ediciones aplicadas (rangos sobre el contenido previo). */
    edits: z.array(edicionDeTextoSchema),
    /** Archivos escritos, ordenados. */
    files: z.array(z.string()),
  }),
  z.object({
    ...comun,
    ok: z.literal(false),
    /** Motivo del rechazo: el mismo vocabulario de `MotivoDeRechazo`. */
    reason: z.enum(MOTIVOS_DE_RECHAZO),
    message: z.string(),
    file: z.string().optional(),
  }),
]);

export type SalidaDeEdit = z.infer<typeof salidaDeEditSchema>;

/** El contrato de `edit --json` como JSON Schema, derivado del esquema Zod. */
export function salidaDeEditJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(salidaDeEditSchema);
}
