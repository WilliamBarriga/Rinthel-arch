/** Helpers of the `session` tests, over its public interface. */
import { applyToWorkspace, inMemoryPort } from 'session';
import type { Intent } from 'session';

type Seen = Parameters<typeof applyToWorkspace>[2];

/**
 * One Intent through the write door over an in-memory Workspace with those files: the rejection, or the
 * edits and the files that ended up written.
 */
export function applyInMemory(files: Readonly<Record<string, string>>, intent: Intent, seen?: Seen) {
  const port = inMemoryPort({ own: { ...files } });
  const r = applyToWorkspace(port, intent, seen);
  return r.ok ? { ...r, files: port.read().own } : r;
}
