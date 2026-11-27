/**
 * Automatic save of an editor file, without React or DOM: accumulates the buffer changes since the last saved base
 * and sends them as minimal edits (`POST /api/edit { ediciones, version, aunqueNoCompile: true }`) ~400 ms after the
 * last change, or right away with `save()` (Mod+S, losing focus, before undo, redo or jump in `dev`).
 * External writes (#191): on a 409 it reads the disk, merges with `threeWayMerge` (the disk wins on overlap), hands the
 * Merge to `onReconcile` (the editor dispatches it annotated `fromDisk`) and retries on the new version;
 * `sync({ hash, version })` does the same when `dev` announces another hash of the file, and if the hash is the base's
 * (the echo of an own save, or a change in another file) it only adopts the version, without reading or touching the buffer.
 * Invariants: sends and reconciliations go in series; what is typed during a send is saved afterwards over the new
 * base; `pending` always takes the base to the buffer. Any other rejection keeps the changes pending and the state `error`.
 */
import { contentHash } from 'canonical';
import { ChangeSet, Text } from '@codemirror/state';

import type { SendResult } from '../client';
import type { EditsRequest } from '../../src/protocol';
import { editsFromChanges } from './changes';
import { threeWayMerge } from './reconciliation';
import type { Merge } from './reconciliation';

/** Retries of a save rejected with 409 (each one after reconciling with the disk). */
const RETRIES_AFTER_409 = 3;

/** Wait after the last change before saving (ADR 0007). */
export const SAVE_DELAY_MS = 400;

export type SaveState = { kind: 'guardado' } | { kind: 'sin-guardar' } | { kind: 'guardando' } | { kind: 'error'; message: string; stale: boolean };

export interface SaverOptions {
  file: string;
  /** Text of the file as it is on disk at `version`. */
  base: string;
  version: number;
  send(request: EditsRequest): Promise<SendResult>;
  onStateChange?(state: SaveState): void;
  /** Reads the file on disk with the `version` of the state that includes it; `undefined` if it could not. */
  readDisk?(): Promise<{ text: string; version: number } | undefined>;
  /** Receives each Merge with the disk; it must apply `toBuffer` to the buffer at once, without saving it. */
  onReconcile?(merge: Merge): void;
  waitMs?: number;
}

export interface Saver {
  /** Records buffer changes (they must start from the current document) and schedules the save. */
  change(changes: ChangeSet): void;
  /** Saves what is pending now and waits for it (with nothing pending, resolves when the send in progress ends). */
  save(): Promise<void>;
  /** There are changes not yet confirmed by `dev` (pending or in flight). */
  dirty(): boolean;
  state(): SaveState;
  /** `dev` announces the file `hash` at `version`: if it is not the base's, reads the disk and reconciles. */
  sync(onDisk: { hash: string; version: number }): Promise<void>;
  /** Text and `version` of the last confirmed base. */
  base(): { text: string; version: number };
  /** Cancels the timer (sends nothing). */
  close(): void;
}

export function createSaver(options: SaverOptions): Saver {
  const { file, send, onStateChange: onStateChange = () => undefined, readDisk: readDisk = async () => undefined, onReconcile: onReconcile = () => undefined, waitMs: waitMs = SAVE_DELAY_MS } = options;
  let base = options.base;
  let version = options.version;
  let pending = ChangeSet.empty(base.length);
  let inFlight = false;
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: SaveState = { kind: 'guardado' };
  const pin = (fresh: SaveState): void => {
    state = fresh;
    onStateChange(fresh);
  };
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  const inSeries = (task: () => Promise<void>): Promise<void> => {
    const r = queue.then(task);
    queue = r.catch(() => undefined);
    return r;
  };
  const schedule = (): void => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      void save();
    }, waitMs);
  };
  const apply = (changes: ChangeSet, text: string): string => changes.apply(Text.of(text.split('\n'))).toString();

  const sendPending = async (): Promise<SendResult> => {
    const sent = pending;
    const edits = editsFromChanges(file, base, sent);
    pending = ChangeSet.empty(sent.newLength);
    pin({ kind: 'guardando' });
    inFlight = true;
    const r = await send({ ediciones: edits, version, aunqueNoCompile: true }).finally(() => {
      inFlight = false;
    });
    if (r.ok) {
      base = apply(sent, base);
      if (r.version !== undefined) version = r.version;
      pin(pending.empty ? { kind: 'guardado' } : { kind: 'sin-guardar' });
    } else {
      pending = sent.compose(pending);
      pin({ kind: 'error', message: r.message, stale: r.stale });
    }
    return r;
  };

  /** Merges the buffer with the disk; `false` if it could not be read. */
  const reconcile = async (): Promise<boolean> => {
    const disk = await readDisk();
    if (disk === undefined) return false;
    // No `await` from here on: what was typed while reading is already in `pending`.
    const merge = threeWayMerge(base, disk.text, apply(pending, base));
    base = disk.text;
    version = disk.version;
    pending = merge.pending;
    if (!merge.toBuffer.empty || merge.lost.length > 0) onReconcile(merge);
    pin(pending.empty ? { kind: 'guardado' } : { kind: 'sin-guardar' });
    return true;
  };

  const save = (): Promise<void> => {
    cancel();
    return inSeries(async () => {
      for (let attempt = 0; attempt <= RETRIES_AFTER_409 && !pending.empty; attempt++) {
        const r = await sendPending();
        if (r.ok || !r.stale || attempt === RETRIES_AFTER_409 || !(await reconcile())) return;
      }
    });
  };

  const sync = (onDisk: { hash: string; version: number }): Promise<void> =>
    inSeries(async () => {
      if (onDisk.hash === contentHash(base)) {
        version = Math.max(version, onDisk.version);
        return;
      }
      if ((await reconcile()) && !pending.empty) schedule();
    });

  return {
    change(changes) {
      if (changes.empty) return;
      pending = pending.compose(changes);
      if (state.kind !== 'guardando') pin({ kind: 'sin-guardar' });
      schedule();
    },
    save: save,
    sync: sync,
    dirty: () => !pending.empty || inFlight,
    state: () => state,
    base: () => ({ text: base, version }),
    close: cancel,
  };
}
