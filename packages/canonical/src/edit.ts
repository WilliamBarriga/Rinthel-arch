/**
 * Zod schema of the `edit --json` output (ADR 0005). Version independent of `validate` and `inspect`:
 * adding fields does not break the contract; removing them or changing their meaning requires bumping `EDIT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

import { REJECTION_REASONS } from './pin';

export const EDIT_CONTRACT_VERSION = 2;

/** Stable hash (53 bits, hex) of a file's content; not cryptographic. Pure, without `node:crypto`. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const positionSchema = z.object({ line: z.number().int().min(1), column: z.number().int().min(1) });

/** Text edit `{ file, range, replacement }`; the range is 1-based with an excluded end. */
export const textEditSchema = z.object({
  file: z.string(),
  range: z.object({ start: positionSchema, end: positionSchema }),
  replacement: z.string(),
  /** New path of `file` (file or folder): the `fix` of `old-workspace-convention`. The text part is an empty edit. */
  rename: z.string().optional(),
});

/** Entry of `edit --edits`; the optional `hash` is that of the file the requester saw. */
export const requestedEditsSchema = z.array(textEditSchema.extend({ hash: z.string().optional() })).min(1);

const common = { contractVersion: z.literal(EDIT_CONTRACT_VERSION) };

export const editOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ...common,
    ok: z.literal(true),
    /** Ranges over the previous content. */
    edits: z.array(textEditSchema),
    /** Written files, sorted. */
    files: z.array(z.string()),
  }),
  z.object({
    ...common,
    ok: z.literal(false),
    reason: z.enum(REJECTION_REASONS),
    message: z.string(),
    file: z.string().optional(),
  }),
]);

export type EditOutput = z.infer<typeof editOutputSchema>;

export function editOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(editOutputSchema);
}
