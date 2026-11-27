/**
 * Activity log events for the `session` tests. `dev-ui/contract` (source code, published for `dev-ui` and `cli`)
 * has its own: source code does not import from `tests/helpers` and `session` does not import from `dev-ui`.
 */
import type { ActivityEvent } from 'canonical';

/** A successful `validate` of process `pid`, with the time derived from `pid`; `extra` overrides any field. */
export const activityEvent = (pid: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  contractVersion: 2,
  ts: `2026-11-19T10:00:${String(pid % 60).padStart(2, '0')}.000Z`,
  pid,
  command: 'validate',
  args: [],
  exitCode: 0,
  durationMs: 1,
  ...extra,
});

/** The `.diagrams/activity.jsonl` lines with those Events. */
export const activityLines = (...events: ActivityEvent[]): string => events.map((e) => `${JSON.stringify(e)}\n`).join('');
