/**
 * Esquema Zod de la salida de `validate --json` (ADR 0008). Es la fuente del
 * contrato: el CLI lo usa para emitir y el skill generado para describirlo.
 * Anadir campos o codigos no rompe el contrato; quitarlos o cambiar su
 * significado exige subir `CONTRACT_VERSION`.
 */
import { z } from 'zod';

import type { Issue } from './issue';

/** Version entera del contrato de salida. */
export const CONTRACT_VERSION = 1;

const posicionSchema = z.object({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});

export const issueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['error', 'warning']),
  file: z.string(),
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  message: z.string(),
  hint: z.string().optional(),
  related: z
    .array(posicionSchema.extend({ file: z.string(), message: z.string() }))
    .optional(),
  fix: z
    .object({
      file: z.string(),
      range: z.object({ start: posicionSchema, end: posicionSchema }),
      replacement: z.string(),
    })
    .optional(),
}) satisfies z.ZodType<Issue>;

/** `summary` cuenta todos los issues encontrados, aunque `issues` se trunque. */
export const salidaDeValidateSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  ok: z.boolean(),
  summary: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    truncated: z.boolean(),
  }),
  issues: z.array(issueSchema),
});

export type SalidaDeValidate = z.infer<typeof salidaDeValidateSchema>;

/**
 * El contrato de la salida como JSON Schema, derivado del esquema Zod: la fuente
 * del skill generado para agentes (ADR 0008).
 */
export function salidaDeValidateJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(salidaDeValidateSchema);
}
