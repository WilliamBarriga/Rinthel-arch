/**
 * Zod schema of the Activity event: one line of `<workspace>/.diagrams/activity.jsonl` (ADR 0005, amendment
 * "Registro de actividad"). Version independent of `validate`, `inspect` and `edit`: adding fields does not break the
 * contract; removing them or changing their meaning requires bumping `ACTIVITY_CONTRACT_VERSION`.
 */
import { z } from 'zod';

export const ACTIVITY_CONTRACT_VERSION = 2;

/** CLI commands that log activity. */
export const COMMANDS_WITH_ACTIVITY = ['validate', 'build', 'inspect', 'edit'] as const;

export const activityEventSchema = z.object({
  contractVersion: z.literal(ACTIVITY_CONTRACT_VERSION),
  /** ISO 8601. */
  ts: z.string(),
  pid: z.number().int(),
  /** Free text from `DIAGRAMS_AGENT`. */
  agent: z.string().optional(),
  command: z.enum(COMMANDS_WITH_ACTIVITY),
  /** The full argv after the command. */
  args: z.array(z.string()),
  exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  durationMs: z.number().min(0),
  /** Only what the command names; the CLI infers nothing. */
  target: z
    .object({
      view: z.string().optional(),
      node: z.string().optional(),
      theme: z.string().optional(),
      files: z.array(z.string()).optional(),
    })
    .optional(),
  /** Only `validate` and `build`. */
  summary: z.object({ errors: z.number().int().min(0), warnings: z.number().int().min(0) }).optional(),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityTarget = NonNullable<ActivityEvent['target']>;

/**
 * Incremental reader of `activity.jsonl` (pure: it receives the whole file text, `undefined` if it does not exist).
 * Each call returns the Activity events of the complete lines it had not returned yet. It skips the lines that do not
 * parse or do not match `activityEventSchema`; a line without a trailing `\n` waits for the next read. If the text no
 * longer starts with what was read (file truncated or rotated) or is missing, it reads again from the start.
 */
export function createActivityReader(): (text: string | undefined) => ActivityEvent[] {
  let read = '';
  return (text) => {
    if (text === undefined || !text.startsWith(read)) read = '';
    if (text === undefined) return [];
    const end = text.lastIndexOf('\n') + 1;
    if (end <= read.length) return [];
    const added = text.slice(read.length, end);
    read = text.slice(0, end);
    return added.split('\n').flatMap((line) => {
      if (line.trim() === '') return [];
      try {
        const r = activityEventSchema.safeParse(JSON.parse(line));
        return r.success ? [r.data] : [];
      } catch {
        return [];
      }
    });
  };
}
