/**
 * `dev-ui/protocol`: the `dev` protocol between the server (`cli`) and the page, as the page sees it (ADR 0004, 0007).
 * Interface: re-exports from `canonical` (`dev.ts`, the single owner of the protocol) the routes (`DEV_ROUTES`), the
 * named SSE events (`DEV_EVENTS`), the schemas of what the Live workspace produces (state, Diff, File history,
 * activity, files, code, accepted writes, errors and rejections, `inspect` not found) and those of the requests. The
 * page validates with them; `cli` imports only types from here (it takes the values from `canonical`).
 * Invariants: no DOM nor Node; it only re-exports from `canonical`, so importing it does not drag the browser app.
 */
export {
  devActivitySchema,
  devFileSchema,
  devFilesSchema,
  devCodeSchema,
  INSPECT_COMMANDS,
  devTrustSchema,
  devDiffSchema,
  diffElementSchema,
  devHistoryEntrySchema,
  devErrorSchema,
  devWriteSchema,
  devStateSchema,
  DEV_EVENTS,
  devHistorySchema,
  DEV_HISTORY_START,
  inspectNotFoundSchema,
  devIssueSchema,
  DIFF_ORIGINS,
  editsRequestSchema,
  jumpRequestSchema,
  devRejectionSchema,
  fileRoute,
  inspectRoute,
  DEV_ROUTES,
  CHANGE_KINDS,
} from 'canonical';
export type {
  DevActivity,
  DevFile,
  DevFiles,
  DevCode,
  InspectCommand,
  DevDiff,
  DiffElement,
  DevHistoryEntry,
  DevError,
  DevWrite,
  DevState,
  DevEvent,
  DevHistory,
  InspectNotFound,
  DevIssue,
  DevEventName,
  DiffOrigin,
  EditsRequest,
  DevRejection,
  ChangeKind,
} from 'canonical';
