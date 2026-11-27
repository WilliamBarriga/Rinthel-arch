/**
 * `canonical`: Zod schemas and types of the Canonical form, the cached Geometry, the edit Intents, the
 * CLI JSON outputs, the Activity event and the `dev` protocol, of which it is the single owner (routes, SSE events, state, Diff, File history); `validate`, `resolveView`, `revealAt` and icons (ADR 0002, 0003, 0005, 0007, 0008).
 * Invariants: qualified ids `a.b.c` define the hierarchy; colors are Palette names, never hex; of the Theme it
 * only knows `name` and `palette`; a View only selects Nodes.
 * Errors: `validate` returns sorted issues and never throws; it only throws on usage or internal failures.
 * Dependencies: only `zod`; it is the first of `canonical -> tema -> dsl -> layout -> session -> render -> shell -> estudio -> cli`.
 */
export {
  ER_CARDINALITIES,
  ATTRIBUTE_KEYS,
  canonicalFormSchema,
  nodeIdSchema,
  nodeSchema,
  overrideSchema,
  parentOf,
  stepSchema,
  themeSchema,
  MESSAGE_KINDS,
  FRAGMENT_OPERATORS,
  VIEW_TYPES,
  nodeKindSchema,
  viewSchema,
} from './schema';
export { cachedGeometrySchema, geometrySchema } from './geometry';
export type {
  ActivationBox,
  PlacedGroupBox,
  NodeBox,
  Geometry,
  CachedGeometry,
  GraphGeometry,
  SequenceGeometry,
  FragmentFrame,
  PlacedNote,
  PlacedOperand,
  Point,
  EdgeRoute,
  MessageRoute,
} from './geometry';
export { combineIconProviders, genericIcons, hydrateIcons, resolveNodeTypeIcon, sanitizeIcon, serializeIcons, workspaceIcons } from './icons';
export type { IconProvider } from './icons';
export { edgeId, sequenceElementId, parseSequenceElementId, revealAt } from './steps';
export type { Visibility } from './steps';
export { plannedEdge, plannedEndpoint, plannedMessage, plannedSets } from './planned';
export type { PlannedSets } from './planned';
export { nearestCandidates } from './suggestions';
export { validate } from './validate';
export type { ValidateOptions, SourcePath, TextSite, Locator } from './validate';
export { activationsOf, flattenMessages, refTarget, lifelinesOf } from './sequence';
export type { Activation, GroupBox, ResolvedFragment, ResolvedInteraction, ResolvedItem, ResolvedMessage, LocatedMessage, ResolvedNote, ResolvedRef } from './sequence';
export { matchesSelector, resolveView } from './views';
export type { ResolvedEdge, CollapseState, ResolvedNode, ResolvedStep, GraphView, SequenceView, ResolvedView } from './views';
export type {
  StepEdge,
  Edge,
  Attribute,
  NodeKindCatalog,
  AttributeKey,
  StepElement,
  Endpoint,
  CanonicalForm,
  Interaction,
  InteractionItem,
  Fragment,
  Message,
  NoteAnchor,
  Note,
  Reference,
  Operand,
  FragmentOperator,
  Model,
  Node,
  NodeOverride,
  Step,
  OpaqueReference,
  Theme,
  MessageKind,
  NodeKind,
  View,
} from './schema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export {
  RENAMED_CONVENTIONS,
  OLD_CATALOG_VALUES,
  obsoleteConventions,
  renameIssue,
  pathRenameIssue,
  oldValueMessage,
  oldRename,
  renameInPath,
} from './renames';
export type { CatalogCategory, RenamedConvention, Rename } from './renames';
export { CODES, DEPRECATED_CODES, CODE_DESCRIPTION } from './codes';
export type { Code } from './codes';

export { EDIT_CONTRACT_VERSION, textEditSchema, contentHash, requestedEditsSchema, editOutputJsonSchema, editOutputSchema } from './edit';
export type { EditOutput } from './edit';

export { ACTIVITY_CONTRACT_VERSION, COMMANDS_WITH_ACTIVITY, createActivityReader, activityEventSchema } from './activity';
export type { ActivityEvent, ActivityTarget } from './activity';

export { INSPECT_CONTRACT_VERSION, inspectOutputJsonSchema, inspectOutputSchema } from './inspect';
export { SCAN_CONTRACT_VERSION, scanChangesSchema, scanCoverageNoticeSchema, scanCoverageSchema, scanSummarySchema } from './scan';
export type { ScanChanges, ScanCoverage, ScanCoverageNotice, ScanSummary } from './scan';
export type { InspectOutput } from './inspect';

export { REJECTION_REASONS, orderIntentSchema, pinIntentSchema, themeIntentSchema, intentSchema } from './pin';
export type { Intent, OrderIntent, PinIntent, ThemeIntent, RejectionReason } from './pin';
export { isFontFile, FONTS_ROUTE, fontMimeType, fontUrl } from './fonts-route';
export {
  devActivitySchema,
  devFileSchema,
  fileFromRoute,
  devFilesSchema,
  PROPERTY_CLASSES,
  elementKey,
  devCodeSchema,
  INSPECT_COMMANDS,
  devTrustSchema,
  devDiffSchema,
  diffSchema,
  emptyDiff,
  diffElementSchema,
  devHistoryEntrySchema,
  devErrorSchema,
  devWriteSchema,
  devStateSchema,
  rejectionHttpStatus,
  elementLabel,
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
} from './dev';
export type {
  DevActivity,
  DevFile,
  DevFiles,
  PropertyClass,
  DevCode,
  InspectCommand,
  Diff,
  DevDiff,
  ChangedElement,
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
  ChangedProperty,
  ChangeKind,
  DiffElementKind,
} from './dev';

export { CONTRACT_VERSION, issueSchema, validateOutputJsonSchema, validateOutputSchema } from './output';
export type { ValidateOutput } from './output';
