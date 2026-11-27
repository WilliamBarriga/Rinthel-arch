/**
 * Disk log: the only owner in `cli` of the Activity log, which lives in the output folder of `workspace.ts`
 * (`<workspace>/.diagrams/activity.jsonl`): appending with rotation (used by `validate`, `build`, `inspect` and `edit`) and
 * watching (used by `dev`). The schema and the pure reader of the log are `canonical`'s.
 * Invariants: one line per append, written with a single `write` in append mode; past 1 MB it rotates to
 * `activity.1.jsonl` (one generation). Watching polls with `fs.watchFile`, which works even if the file does not
 * exist yet and sees the rotation (another inode, another size).
 * Errors: `appendToLog` throws if it cannot write (the appender decides); `read` of a missing log gives `undefined`.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { join } from 'node:path';

import type { ActivityLog } from 'session';

import { outputFolder } from './workspace';

const LOG_FILE = 'activity.jsonl';
const ROTATED_FILE = 'activity.1.jsonl';
const BYTE_LIMIT = 1024 * 1024;
/** How often the log on disk is checked. */
const POLL_INTERVAL_MS = 250;

const logPath = (root: string): string => join(outputFolder(root), LOG_FILE);

/** Appends `line` (with its newline) to the log of `root`, creating the output folder and rotating if needed. */
export function appendToLog(root: string, line: string): void {
  const folder = outputFolder(root);
  mkdirSync(folder, { recursive: true });
  const path = logPath(root);
  let size = 0;
  try {
    size = statSync(path).size;
  } catch {
    // does not exist yet
  }
  if (size > BYTE_LIMIT) renameSync(path, join(folder, ROTATED_FILE));
  appendFileSync(path, line);
}

/** The log of `root` as the live Workspace expects it, with its own watcher (the Workspace's ignores hidden folders). */
export function diskLog(root: string): ActivityLog {
  const path = logPath(root);
  return {
    read() {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    watch(handleChange) {
      const listener = (): void => handleChange();
      watchFile(path, { interval: POLL_INTERVAL_MS, persistent: false }, listener);
      return () => unwatchFile(path, listener);
    },
  };
}
