/**
 * Live workspace: the state of `dev` without HTTP (current and last good Session, File history, write queue, versions).
 * Events: it is the only owner of the SSE event sequence of the protocol (`DevEvent` from `canonical`): `connection()`
 * gives what a client receives on connect (state, File history and activity with `previos`) and `listen` the stream
 * (after each state, its File history and its Diff; the new activity). The adapters (real server, `inMemoryDev`) only serialize.
 * Invariants: an edit with `version` uses that version's hashes as `seen`; a version outside the last
 * `STORED_VERSIONS` rejects with `stale-hash`; without a version, it applies over the current text.
 * Edit, undo and redo are queued; a write that fails halfway is reverted. With errors, the state carries the issues
 * with the Canonical form and the Geometry of the last good Session, without `cambio`. The history is per file
 * (`FileHistory`): an external write does not reset it; undo and redo reject with `stale-hash` only if a file the
 * entry restores changed outside. Text edits (editor, `fix`) use the same door as Intents; with `evenIfBroken` they
 * are written even if they introduce errors. Jump (#193) writes the target snapshot once, without pushing, with the
 * same rejection rule; `history()` says which entries are reachable on the current disk. Every own write (edit, undo,
 * redo, jump, revert) goes through `writeOwn`/`removeOwn`, the single point that marks the `propio` origin of the Diff.
 * Errors: rejections as data; I/O failures when writing propagate after reverting; read failures when recompiling
 * are ignored until the next change; `openLiveWorkspace` throws if the initial read fails.
 * Diff: each Session without errors is compared with the last good one and, if something changed, it is emitted after
 * the state. It is `propio` if every changed file matches by hash what the UI wrote (Intent, undo, redo, jump and what
 * is reverted); otherwise `externo`. With Sessions with errors in between, the Diff is a single one and it is external
 * if any intermediate write was.
 * Activity log: if the port provides it, the Live workspace composes a live Activity log (`live-activity-log.ts`, with
 * the same clock and debounce) and emits it after the state and the File history.
 */
import { combineIconProviders, obsoleteConventions, emptyDiff, isFontFile, genericIcons, inspectOutputSchema, serializeIcons, workspaceIcons } from 'canonical';
import type { DevFile, DevFiles, DevDiff, DevState, DevEvent, CachedGeometry, DevHistory, Intent, Issue, RejectionReason, DiffOrigin, ChangeKind } from 'canonical';
import type { ArchivosDelWorkspace } from 'dsl';
import { themeComponents } from 'theme';

import { applyToWorkspace } from './apply';
import type { TextEdit, WorkspacePort } from './apply';
import { classifyChange } from './change';
import type { Query, QueryAnswer } from './queries';
import { computeDiff } from './diff';
import { contentHash } from './edits';
import { intentDescription, textDescription, undoOn, emptyFileHistory, visibleHistory, record, redoOn, jump } from './file-history';
import type { FileHistory, RestoreResult } from './file-history';
import type { Seen } from './intents';
import { openLiveActivityLog } from './live-activity-log';
import type { ActivityLog } from './live-activity-log';
import { debounce } from './clock';
import type { Clock } from './clock';
import { openSession } from './session';
import type { ComponentInterface, GeometryOptions, Session } from './session';

/** State versions remembered to translate the seen version to `seen`. */
export const STORED_VERSIONS = 16;

export interface LiveWorkspacePort extends WorkspacePort {
  /** A missing file is not an error. */
  remove(path: string): void;
  /** Hash of each watched resource (`.tsx`, fonts), or `undefined` if the adapter does not know them. */
  resources(): Record<string, string> | undefined;
  /** Returns how to stop watching. */
  watch(onChange: () => void): () => void;
  /** Every Workspace path (any file), for the `old-workspace-convention` errors; without it they are not reported. */
  paths?(): string[];
  /** Activity log (`.diagrams/activity.jsonl`) with its own watcher; without it, there is no activity. */
  activity?: ActivityLog;
}

export interface LiveWorkspaceOptions {
  port: LiveWorkspacePort;
  /** Absolute root of the Workspace: only for the `href` (`vscode://file/...`) of each issue. */
  root: string;
  /** Debounce of the watcher and of the Activity log (the core has no clock of its own). */
  clock: Clock;
  /** Wait in ms after the last change before recompiling; `DEBOUNCE_MS` by default. */
  debounceMs?: number;
  /** By default there is no code. */
  compileCode?: () => CompiledCode;
  trustCode?: boolean;
  /** Time in ms of each File history entry. */
  now: () => number;
}

/** What the adapter's compiler of Themes with code gives (`cli`: esbuild over the `.tsx` files). */
export interface CompiledCode {
  components: Readonly<Record<string, ComponentInterface>>;
  issues: readonly Issue[];
  bundle: string;
}

/** `version` is that of the state after recompiling. */
export type LiveWorkspaceResult = { ok: true; version: number } | { ok: false; reason: RejectionReason; message: string; file?: string };

/** Text edits from the UI (`POST /api/edit { ediciones }`): editor save, a `fix` or "Apply N fixes". */
export interface TextEdits {
  edits: readonly TextEdit[];
  /** Description of the File history entry; "text of <files>" by default. */
  description?: string;
  /** Editor save: written even if it introduces errors (ADR 0007). Without it, a new error rejects with `invalid`. */
  evenIfBroken?: boolean;
}

/** `components` are those used by the Themes of the last good Canonical form. */
export interface WorkspaceCode {
  components: string[];
  trusted: boolean;
  bundle: string;
}

export interface LiveWorkspace {
  state(): DevState;
  /**
   * Stream of named protocol events, in order: after each recompilation, `estado` and its `historial` and, if the
   * Canonical form changed, the `diferencia` of that `version`; per batch appended to the Activity log (debounced),
   * `actividad` with `previos: false`. Returns how to stop listening.
   */
  listen(onEvent: (event: DevEvent) => void): () => void;
  /** `version` is that of the state seen by whoever sends the Intent or the edits. */
  edit(applicable: Intent | TextEdits, version?: number): Promise<LiveWorkspaceResult>;
  /** File history, oldest first, with what is reachable on the current disk. */
  history(): DevHistory;
  /** Reads the port at the moment: what the editor can open. */
  files(): DevFiles;
  /** `undefined` if the file does not exist. */
  file(path: string): DevFile | undefined;
  undo(): Promise<LiveWorkspaceResult>;
  redo(): Promise<LiveWorkspaceResult>;
  /** Takes the Workspace to entry `id` (0: Start) without pushing; `unknown-entry` if it does not exist. */
  jump(id: number): Promise<LiveWorkspaceResult>;
  /** Geometry of a View of the last good Session (with `theme`, with that Theme and uncached); `undefined` if the View or the Theme is missing. */
  geometry(view: string, options?: GeometryOptions): Promise<CachedGeometry | undefined>;
  /** `inspect` over the last good Session, with the output normalized as `inspect --json`; `undefined` if the Workspace never compiled. */
  query(query: Query): QueryAnswer | undefined;
  /**
   * Connection snapshot: what a `/events` client receives on connect, in order: `estado`, `historial` and the
   * `actividad` with `previos: true` of the live Activity log.
   */
  connection(): DevEvent[];
  /** Reads the port again and recompiles now (without waiting for the debounce). */
  reload(): Promise<void>;
  code(): WorkspaceCode;
  /** From here on the Themes' code is served. */
  trust(): void;
  /** Stops watching and cancels the pending debounce. */
  close(): void;
}

export const DEBOUNCE_MS = 150;

/** Mark of a file the UI removed (not a possible hash). */
const DELETED = '<borrado>';

/** External wins: a single foreign write makes the Diff external. */
const mergeOrigin = (a: DiffOrigin | undefined, b: DiffOrigin | undefined): DiffOrigin | undefined => (a === 'externo' || b === 'externo' ? 'externo' : (a ?? b));

const NO_CODE: CompiledCode = { components: {}, issues: [], bundle: 'return {};' };

const isTextEdits = (applicable: Intent | TextEdits): applicable is TextEdits => 'edits' in applicable;

const hashesOf = (files: ArchivosDelWorkspace): Record<string, string> => Object.fromEntries(Object.entries(files).map(([path, text]) => [path, contentHash(text)]));

export async function openLiveWorkspace(options: LiveWorkspaceOptions): Promise<LiveWorkspace> {
  const { port, root, clock, debounceMs = DEBOUNCE_MS, compileCode = () => NO_CODE, now } = options;

  const fontsOf = (resources: Record<string, string> | undefined): Record<string, string> | undefined =>
    resources === undefined ? undefined : Object.fromEntries(Object.entries(resources).filter(([path]) => isFontFile(path)));
  const sessionOptions = (resources: Record<string, string> | undefined): { fontFiles?: string[] } => {
    const fonts = fontsOf(resources);
    return fonts === undefined ? {} : { fontFiles: Object.keys(fonts) };
  };

  let version = 0;
  let files = port.read().disk;
  /** Resources (`.tsx`, fonts) of the last good Session. */
  let resources = port.resources();
  let change: ChangeKind | undefined;
  let code = compileCode();
  let trusted = options.trustCode ?? false;
  let current: Session = openSession(files, { ...sessionOptions(resources), components: code.components, adapterIssues: code.issues });
  /** Last Session without compilation errors. */
  let lastGood: { session: Session; files: ArchivosDelWorkspace } | undefined = current.source === undefined ? undefined : { session: current, files };
  /** Compile issues plus the old file conventions of the Workspace paths (as `validate` reports them). */
  const withConventions = (list: Issue[]): Issue[] => [...list, ...obsoleteConventions(port.paths?.() ?? [])];
  let issues: Issue[] = withConventions(await current.diagnose());
  /** version -> file -> hash. */
  const versions = new Map<number, Record<string, string>>([[version, hashesOf(files)]]);
  let state = buildState();

  const listeners = new Set<(event: DevEvent) => void>();
  const emit = (event: DevEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };
  let history: FileHistory = emptyFileHistory;
  /** Reachability is computed over the disk at the moment. */
  const devHistory = (): DevHistory => visibleHistory(history, port.read().own);
  /** Path -> hash of what the UI wrote (`DELETED` if it removed it) not yet seen by a recompilation: that is how its echo is recognized. */
  const ownWrites = new Map<string, string>();
  /** Origin of what changed since the last good Session; `undefined` if no file changed. */
  let pendingOrigin: DiffOrigin | undefined;

  function buildState(): DevState {
    const source = lastGood?.session.source;
    const provider = lastGood === undefined ? undefined : combineIconProviders(workspaceIcons(lastGood.files), genericIcons());
    const fonts = fontsOf(resources);
    return {
      version,
      ...(change !== undefined && { cambio: change }),
      fuente: source,
      iconos: provider === undefined ? {} : serializeIcons(provider),
      vistas: source?.views.map(({ id }) => id) ?? [],
      ...(fonts !== undefined && { fuentes: fonts }),
      issues: issues.map((issue) => ({ ...issue, href: `vscode://file/${root}/${issue.file}:${issue.line}:${issue.column}` })),
    };
  }

  // If a change arrives during a recompilation, it is repeated when it ends and whoever waits, waits for both.
  let running: Promise<void> | undefined;
  let pending = false;
  const recompileOnce = async (): Promise<void> => {
    let nextFiles: ArchivosDelWorkspace;
    let nextResources: Record<string, string> | undefined;
    try {
      nextFiles = port.read().disk;
      nextResources = port.resources();
    } catch {
      return; // half-done read (file being rewritten): the next event retries
    }
    pendingOrigin = mergeOrigin(pendingOrigin, originOf(files, nextFiles));
    code = compileCode();
    const session = (lastGood?.session ?? current).update(nextFiles, { ...sessionOptions(nextResources), components: code.components, adapterIssues: code.issues });
    const nextIssues = withConventions(await session.diagnose());
    current = session;
    files = nextFiles;
    // With errors the last good drawing (and its reference resources) is kept: there is no change to draw.
    change = session.source === undefined ? undefined : classifyChange({ source: lastGood?.session.source, resources: resources ?? {} }, { source: session.source, resources: nextResources ?? {} });
    let diff: DevDiff | undefined;
    if (session.source !== undefined) {
      const changes = lastGood?.session.source === undefined ? undefined : computeDiff(lastGood.session.source, session.source);
      // A change without touched files (resources) has no known author: external.
      if (changes !== undefined && !emptyDiff(changes)) diff = { version: version + 1, origen: pendingOrigin ?? 'externo', ...changes };
      pendingOrigin = undefined;
      lastGood = { session, files: nextFiles };
      resources = nextResources;
    }
    issues = nextIssues;
    version += 1;
    versions.set(version, hashesOf(nextFiles));
    versions.delete(version - STORED_VERSIONS);
    state = buildState();
    // Every write (own or external) recompiles: the File history and its reachability travel with each state.
    emit({ name: 'estado', data: state });
    emit({ name: 'historial', data: devHistory() });
    if (diff !== undefined) emit({ name: 'diferencia', data: diff });
  };
  /** `propio` if each changed file is a hash echo of a UI write (and consumes it). */
  function originOf(earlier: ArchivosDelWorkspace, nextFiles: ArchivosDelWorkspace): DiffOrigin | undefined {
    const changed = [...new Set([...Object.keys(earlier), ...Object.keys(nextFiles)])].filter((path) => earlier[path] !== nextFiles[path]);
    if (changed.length === 0) return undefined;
    let origin: DiffOrigin = 'propio';
    for (const path of changed) {
      const text = nextFiles[path];
      if (ownWrites.get(path) === (text === undefined ? DELETED : contentHash(text))) ownWrites.delete(path);
      else origin = 'externo';
    }
    // An own write that did not change the text leaves no echo: it is forgotten so as not to mistake a future foreign write.
    for (const [path, hash] of ownWrites) {
      const text = nextFiles[path];
      if ((text === undefined ? DELETED : contentHash(text)) === hash) ownWrites.delete(path);
    }
    return origin;
  }
  /** Single point of own writes of `dev` (the UI: edit, undo, redo, jump, revert); everything else is external. */
  const writeOwn = (path: string, text: string): void => {
    ownWrites.set(path, contentHash(text));
    port.write(path, text);
  };
  const removeOwn = (path: string): void => {
    ownWrites.set(path, DELETED);
    port.remove(path);
  };
  const recompile = (): Promise<void> => {
    if (running !== undefined) {
      pending = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          pending = false;
          await recompileOnce();
        } while (pending);
      } finally {
        running = undefined;
      }
    })();
    return running;
  };

  const recompileDebounce = debounce(clock, debounceMs);
  const cancelPending = recompileDebounce.cancel;
  /** Does not wait for the debounce the write itself triggers. */
  const recompileAfterWrite = async (): Promise<LiveWorkspaceResult> => {
    cancelPending();
    await recompile();
    return { ok: true, version };
  };
  const stopWatching = port.watch(() => recompileDebounce.schedule(() => void recompile().catch(() => undefined)));

  const activity = openLiveActivityLog({ ...(port.activity !== undefined && { log: port.activity }), clock, debounceMs });
  const stopListeningActivity = activity.listen(emit);

  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  /** Best effort: a failure does not interrupt the rest of `paths`. */
  const revert = (origin: ArchivosDelWorkspace, paths: readonly string[]): void => {
    for (const path of paths) {
      try {
        if (path in origin) writeOwn(path, origin[path] as string);
        else removeOwn(path);
      } catch {
        // if the disk keeps failing, the next undo/redo detects the difference and resets the history
      }
    }
  };
  /** If it fails halfway, it reverts and rethrows. */
  const writeToDisk = (origin: ArchivosDelWorkspace, target: ArchivosDelWorkspace): void => {
    const touched: string[] = [];
    try {
      for (const path of Object.keys(target).filter((r) => target[r] !== origin[r]).sort()) {
        touched.push(path);
        writeOwn(path, target[path] as string);
      }
      for (const path of Object.keys(origin).filter((r) => !(r in target)).sort()) {
        touched.push(path);
        removeOwn(path);
      }
    } catch (error) {
      revert(origin, touched);
      throw error;
    }
  };

  const seenOf = (seenVersion: number | undefined): { seen?: Seen } | undefined => {
    if (seenVersion === undefined) return {};
    const hashes = versions.get(seenVersion);
    return hashes === undefined ? undefined : { seen: hashes };
  };

  const edit = (applicable: Intent | TextEdits, seenVersion?: number): Promise<LiveWorkspaceResult> =>
    enqueue(async () => {
      const translated = seenOf(seenVersion);
      if (translated === undefined) {
        return { ok: false, reason: 'stale-hash', message: `State version ${seenVersion} is no longer stored; reload the View` };
      }
      const before = port.read().own;
      const written: string[] = [];
      let result;
      try {
        result = applyToWorkspace(
          {
            read: () => port.read(),
            write: (path, text) => {
              written.push(path);
              writeOwn(path, text);
            },
            ...(port.renamePath !== undefined && { renamePath: port.renamePath.bind(port) }),
            ...(port.exists !== undefined && { exists: port.exists.bind(port) }),
          },
          isTextEdits(applicable) ? applicable.edits : applicable,
          translated.seen,
          { evenIfBroken: isTextEdits(applicable) && applicable.evenIfBroken === true },
        );
      } catch (error) {
        revert(before, written);
        throw error;
      }
      if (!result.ok) return { ok: false, reason: result.reason, message: result.message, ...(result.file !== undefined && { file: result.file }) };
      const description = !isTextEdits(applicable) ? intentDescription(applicable) : (applicable.description ?? textDescription(result.changed));
      history = record(history, description, before, port.read().own, now());
      return recompileAfterWrite();
    });

  const restore = (move: (h: FileHistory, disk: ArchivosDelWorkspace) => RestoreResult): Promise<LiveWorkspaceResult> =>
    enqueue(async () => {
      const disk = port.read().own;
      const r = move(history, disk);
      if (!r.ok) return r;
      writeToDisk(disk, r.files);
      history = r.history;
      return recompileAfterWrite();
    });

  const listFiles = (): DevFiles => {
    const { disk, own } = port.read();
    return {
      version,
      archivos: Object.keys(disk)
        .sort()
        .map((file) => ({ file, hash: contentHash(disk[file] as string), soloLectura: !(file in own) })),
    };
  };

  return {
    state: () => state,
    listen(onEvent) {
      listeners.add(onEvent);
      return () => void listeners.delete(onEvent);
    },
    edit,
    undo: () => restore(undoOn),
    redo: () => restore(redoOn),
    jump: (id) => restore((h, disk) => jump(h, disk, id)),
    history: devHistory,
    files: listFiles,
    file(path) {
      const text = port.read().disk[path];
      return text === undefined ? undefined : { file: path, texto: text, hash: contentHash(text), version };
    },
    geometry: (view, options) => lastGood?.session.geometry(view, options) ?? Promise.resolve(undefined),
    query(query) {
      const r = lastGood?.session.query(query);
      return r === undefined || 'notFound' in r ? r : { output: inspectOutputSchema.parse(r.output) };
    },
    connection: () => [
      { name: 'estado', data: state },
      { name: 'historial', data: devHistory() },
      activity.connection(),
    ],
    reload: () => recompile(),
    code: () => ({ components: [...new Set((lastGood?.session.source?.themes ?? []).flatMap((theme) => themeComponents(theme)))].sort(), trusted, bundle: code.bundle }),
    trust() {
      trusted = true;
    },
    close() {
      cancelPending();
      stopWatching();
      stopListeningActivity();
      activity.close();
    },
  };
}
