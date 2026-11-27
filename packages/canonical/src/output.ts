/**
 * Zod schema of the `validate --json` output (ADR 0005). Adding fields or codes does not break the
 * contract; removing them or changing their meaning requires bumping `CONTRACT_VERSION`.
 */
import { z } from 'zod';

import type { Issue } from './issue';

export const CONTRACT_VERSION = 2;

const positionSchema = z.object({
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
    .array(positionSchema.extend({ file: z.string(), message: z.string() }))
    .optional(),
  fix: z
    .object({
      file: z.string(),
      range: z.object({ start: positionSchema, end: positionSchema }),
      replacement: z.string(),
      rename: z.string().optional(),
    })
    .optional(),
}) satisfies z.ZodType<Issue>;

/** `summary` counts all the issues found, even if `issues` is truncated. */
export const validateOutputSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  ok: z.boolean(),
  summary: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    truncated: z.boolean(),
  }),
  issues: z.array(issueSchema),
});

export type ValidateOutput = z.infer<typeof validateOutputSchema>;

export function validateOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(validateOutputSchema);
}
