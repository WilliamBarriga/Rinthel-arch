/** Every write, removal or external change notifies the watchers, like the disk watcher. */
import { inMemoryWorkspace } from './in-memory-port';
import type { InMemoryContent, InMemoryWorkspace } from './in-memory-port';

import type { LiveWorkspacePort } from './live-workspace';

export interface InMemoryLiveWorkspace extends LiveWorkspacePort, InMemoryWorkspace {
  /** Change made outside `dev`; with `undefined` it removes the file. */
  editOutside(path: string, text: string | undefined): void;
  /** Change made outside `dev` to a `--theme-path` file; notifies like the watcher. */
  editThemeOutside(path: string, text: string | undefined): void;
  touchResource(path: string, hash: string): void;
  /** Appends text to the Activity log (like the CLI of another process) and notifies its watcher. */
  appendActivity(text: string): void;
  /** Replaces the whole log (shortened or rotated); `undefined` removes it. */
  rewriteActivity(text: string | undefined): void;
}

export interface InMemoryLiveContent extends InMemoryContent {
  /** Without it, `resources()` gives `undefined`. */
  resources?: Record<string, string>;
  /** Initial text of `.diagrams/activity.jsonl`; without it, the log does not exist yet. */
  activity?: string;
  /** Every own write throws an `Error` with this message (I/O failure); `editOutside` keeps writing. */
  brokenWrite?: string;
}

export function inMemoryPort({ resources, activity, brokenWrite, ...content }: InMemoryLiveContent): InMemoryLiveWorkspace {
  const base = inMemoryWorkspace(content);
  let log = activity;
  const logWatchers = new Set<() => void>();
  const setLog = (text: string | undefined): void => {
    log = text;
    for (const onChange of [...logWatchers]) onChange();
  };
  let hashes = resources === undefined ? undefined : { ...resources };
  const watchers = new Set<() => void>();
  const notify = (): void => {
    for (const onChange of [...watchers]) onChange();
  };
  const writeOutside = (path: string, text: string): void => {
    base.write(path, text);
    notify();
  };
  const write = (path: string, text: string): void => {
    if (brokenWrite !== undefined) throw new Error(brokenWrite);
    writeOutside(path, text);
  };
  const remove = (path: string): void => {
    base.remove(path);
    notify();
  };
  // Paths of the Workspace: its `.dg` files plus the resources; a folder exists if some path is under it.
  const paths = (): string[] => [...Object.keys(base.read().own), ...Object.keys(hashes ?? {})];
  const isWithin = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);
  const renamePath = (oldPath: string, newPath: string): void => {
    if (brokenWrite !== undefined) throw new Error(brokenWrite);
    const movedPath = (path: string): string => newPath + path.slice(oldPath.length);
    const { own } = base.read();
    for (const path of Object.keys(own).filter((r) => isWithin(r, oldPath))) {
      base.write(movedPath(path), own[path] as string);
      base.remove(path);
    }
    if (hashes !== undefined) hashes = Object.fromEntries(Object.entries(hashes).map(([path, hash]) => [isWithin(path, oldPath) ? movedPath(path) : path, hash]));
    notify();
  };
  return {
    ...base,
    write,
    remove,
    paths,
    exists: (path) => paths().some((r) => isWithin(r, path)),
    renamePath,
    resources: () => (hashes === undefined ? undefined : { ...hashes }),
    watch(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    editOutside: (path, text) => (text === undefined ? remove(path) : writeOutside(path, text)),
    editThemeOutside(path, text) {
      base.writeTheme(path, text);
      notify();
    },
    activity: {
      read: () => log,
      watch(onChange) {
        logWatchers.add(onChange);
        return () => logWatchers.delete(onChange);
      },
    },
    appendActivity: (text) => setLog((log ?? '') + text),
    rewriteActivity: setLog,
    touchResource(path, hash) {
      hashes = { ...hashes, [path]: hash };
      notify();
    },
  };
}
