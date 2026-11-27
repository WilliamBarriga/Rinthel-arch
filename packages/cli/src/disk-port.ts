/**
 * The live Workspace on disk, shared by `dev` and `export`: the disk port (`diskPortOf`), its default watcher and
 * the real clock. It has no HTTP: `dev.ts` serves it, `export.ts` reads it in process.
 */
import { existsSync, renameSync, rmSync, watch } from 'node:fs';

import type { LiveWorkspacePort, Clock } from 'session';

import { diskLog } from './disk-log';
import { readWithThemes } from './cli-session';
import { workspaceTarget, writeTextFile, readResources, readPaths, readWorkspace } from './workspace';

/** `setTimeout` as the clock of the live Workspace. */
export const realClock: Clock = {
  schedule(fn, ms) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

/** Recursive `fs.watch`; ignores hidden folders (`.diagrams/`, `.git/`) and `node_modules`. */
function watchDisk(root: string, handleChange: () => void): () => void {
  const watcher = watch(root, { recursive: true }, (_event, name) => {
    if (name !== null && name.split(/[\\/]/).some((part) => part.startsWith('.') || part === 'node_modules')) return;
    handleChange();
  });
  return () => watcher.close();
}

/** Notifies any change under `root`; returns how to stop watching. */
export type Watcher = (root: string, handleChange: () => void) => () => void;

/**
 * The live Workspace over the disk: the `.dg` files of `workspace` (own) merged after those of `themes`, atomic writes
 * under the root, resources (`.tsx`, fonts) of both folders, the watcher (recursive `fs.watch` by default) and the
 * Activity log of `disk-log.ts`.
 */
export function diskPortOf(workspace: string, { themes, watch: watchFn = watchDisk }: { themes?: string; watch?: Watcher } = {}): LiveWorkspacePort {
  return {
    activity: diskLog(workspace),
    read: () => ({ own: readWorkspace(workspace), disk: readWithThemes(readWorkspace, workspace, themes) }),
    write: (path, text) => writeTextFile(workspaceTarget(workspace, path), text),
    remove: (path) => rmSync(workspaceTarget(workspace, path), { force: true }),
    renamePath: (old, newOne) => renameSync(workspaceTarget(workspace, old), workspaceTarget(workspace, newOne)),
    exists: (path) => existsSync(workspaceTarget(workspace, path)),
    paths: () => readPaths(workspace),
    resources: () => ({ ...(themes === undefined ? {} : readResources(themes)), ...readResources(workspace) }),
    watch: (handleChange) => watchFn(workspace, handleChange),
  };
}
