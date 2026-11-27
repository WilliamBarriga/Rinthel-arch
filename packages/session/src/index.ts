/**
 * `session`: compiled state of a Workspace (Session in CONTEXT.md).
 * Interface: `openSession(files, { theme? }) -> Session` (compile, validate, layout, Resolved style, `query` including `inspect theme`); single write door `applyToWorkspace`, `computeDiff(before, after)` (pure Diff between Canonical forms), `contentHash` and the Undo history of Intents (`createUndoHistory`, `editInHistory`, `undo`, `redo`).
 * Live workspace (the state of `dev` without transport, owner of the event sequence: `connection` and `listen`; it composes the File history and the live Activity log): `openLiveWorkspace` over a `LiveWorkspacePort` with injected clock and time,
 * `handleDevApi` (the `/api/*` routes as request -> complete response) and `inMemoryPort` (fake of the port).
 * Only what another package uses is exported; the rest is internal.
 * Invariants: pure over `ArchivosDelWorkspace` (no disk); a Session is immutable; it never imports code (ADR 0008).
 * Errors: the Workspace's are issues; rejected edits carry `reason`; layout failures and port I/O failures propagate.
 * Dependencies: `canonical`, `theme`, `dsl` and `layout`.
 */
export { openSession } from './session';
export type { ComponentInterface, Session } from './session';
export { contentHash } from './edits';
export { computeDiff } from './diff';
export { applyToWorkspace } from './apply';
export type { Applicable } from './apply';
export { createUndoHistory, undo, editInHistory, redo } from './intents';
export type { UndoHistory, Intent } from './intents';
export type { QueryAnswer } from './queries';
export { openLiveWorkspace } from './live-workspace';
export type { CompiledCode, LiveWorkspacePort, LiveWorkspace } from './live-workspace';
export type { ActivityLog } from './live-activity-log';
export type { Clock } from './clock';
export { handleDevApi, fetchOverDevApi } from './dev-api';
export { inMemoryPort } from './in-memory-live-port';
export type { InMemoryWorkspace } from './in-memory-port';
