/**
 * Fake clock for the Live workspace and the live Activity log of `session` (single copy): scheduled tasks only run
 * on `advance`. It satisfies the `Clock` of `session` by shape, without importing it.
 */
export interface FakeClock {
  schedule(fn: () => void, ms: number): () => void;
  /** Advances time and runs the due tasks, in scheduling order. */
  advance(ms: number): void;
  /** Scheduled tasks that have not run yet. */
  pending(): number;
}

export function fakeClock(): FakeClock {
  let now = 0;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    schedule(fn, ms) {
      const task = { at: now + ms, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance(ms) {
      now += ms;
      const due = tasks.filter((t) => t.at <= now);
      tasks = tasks.filter((t) => t.at > now);
      for (const t of due) t.fn();
    },
    pending: () => tasks.length,
  };
}
