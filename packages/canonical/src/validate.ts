/**
 * Semantic checks over the already assembled Canonical form (ADR 0005). Pure; never throws or mutates.
 * The Canonical form keeps no positions: a `Locator` translates the value's path to file and range; without it, the Issue
 * comes out at `(canonico):1:1` without `fix`. Out of scope: what the DSL merge makes disappear (syntax,
 * duplicate Nodes and Themes, `extend` or `extends` without target, `unknown-view-type`) and `overlapping-pins`.
 */
import { CODES } from './codes';
import { ER_CARDINALITIES } from './schema';
import { OLD_CATALOG_VALUES, oldValueMessage, oldRename } from './renames';
import type { StepElement, CanonicalForm, Interaction, InteractionItem, Node, Theme, View } from './schema';
import type { IconProvider } from './icons';
import type { Issue, TextRange } from './issue';
import { nearestCandidates } from './suggestions';
import { activationsOf, flattenMessages, refTarget } from './sequence';
import type { LocatedMessage } from './sequence';
import { matchesSelector, resolveView } from './views';

/** Path of a value inside the Canonical form, e.g. `['views', 0, 'links', 1, 'view']`. */
export type SourcePath = readonly (string | number)[];

export interface TextSite {
  file: string;
  range: TextRange;
}

/** `null`: the value is not reliable (its file has syntax errors) and produces no Issues. */
export type Locator = (path: SourcePath) => TextSite | null;

export interface ValidateOptions {
  /** Without it, `icon` keys are not checked. */
  icons?: IconProvider;
  locate?: Locator;
}

const UNLOCATED: TextSite = {
  file: '(canonico)',
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
};

/** Issue at `path` with optional severity and related site (another path in the Canonical form). */
type EmitWith = (path: SourcePath, code: string, message: string, extra?: { severity?: 'error' | 'warning'; hint?: string; /** Replacement of the text located at `path` (a `fix` that rewrites it). */ replacement?: string; related?: { path: SourcePath; message: string } }) => void;

type Emit = (
  path: SourcePath,
  code: string,
  message: string,
  written?: string,
  existing?: Iterable<string>,
  /** Text of the `fix` as written in the DSL (e.g. quoted); by default, the candidate as is. */
  write?: (candidate: string) => string,
  /** `hint` with no close candidate. */
  withoutCandidates?: string,
) => void;

/** Issues sorted by file, line, column and code. */
export function validate(source: CanonicalForm, options: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const { locate } = options;

  /** With `existing` it adds a `fix` (one candidate) or a `hint` (several). */
  const emit: Emit = (path, code, message, written, existing, write = (candidate) => candidate, withoutCandidates) => {
    const site = locate === undefined ? UNLOCATED : locate(path);
    if (site === null) return;
    const { file, range } = site;
    const issue: Issue = { code, severity: 'error', file, ...range.start, message };
    if (written !== undefined && existing !== undefined) {
      const candidates = nearestCandidates(written, existing);
      const [single] = candidates;
      if (candidates.length === 1 && single !== undefined) {
        if (locate !== undefined) issue.fix = { file, range, replacement: write(single) };
      } else if (candidates.length > 1) {
        issue.hint = `Candidates: ${candidates.join(', ')}`;
      } else if (withoutCandidates !== undefined) {
        issue.hint = withoutCandidates;
      }
    }
    issues.push(issue);
  };

  const emitWith: EmitWith = (path, code, message, extra = {}) => {
    const site = locate === undefined ? UNLOCATED : locate(path);
    if (site === null) return;
    const issue: Issue = { code, severity: extra.severity ?? 'error', file: site.file, ...site.range.start, message };
    if (extra.hint !== undefined) issue.hint = extra.hint;
    if (extra.replacement !== undefined && locate !== undefined) issue.fix = { file: site.file, range: site.range, replacement: extra.replacement };
    if (extra.related !== undefined) {
      const other = locate === undefined ? UNLOCATED : locate(extra.related.path);
      if (other !== null) issue.related = [{ file: other.file, ...other.range.start, message: extra.related.message }];
    }
    issues.push(issue);
  };

  const types = new Set(source.specification.nodeTypes.map((kind) => kind.name));
  validateInteractions(source, emit, emitWith);
  validateNodes(source.model.nodes, ['model', 'nodes'], types, emit);
  validatePlannedGroups(source.model.nodes, ['model', 'nodes'], emitWith);
  validateEdges(source, emit);
  validateCatalog(source, options.icons, emit);
  source.views.forEach((view, index) => {
    validateView(source, view, index, emit, emitWith);
    validateSequenceView(source, view, index, emit, emitWith);
  });

  return issues.sort(compareIssues);
}

function validateNodes(nodes: readonly Node[], path: SourcePath, types: ReadonlySet<string>, emit: Emit): void {
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (!types.has(node.type)) {
      emit(
        [...here, 'type'],
        CODES.E_UNKNOWN_NODE_TYPE,
        `Node kind '${node.type}' is not declared in specification`,
        node.type,
        types,
      );
    }
    validateNodes(node.children, [...here, 'children'], types, emit);
  });
}

/** Has Source `path`: it already exists in the code (ADR 0010, 0011). */
const isReal = (node: Node): boolean => node.source.some((reference) => reference.kind === 'path');

/**
 * A Group marked `planned` with real descendants (Source `path`) would draw them as planned: one error per Group,
 * on its mark, with a `fix` that removes it and the first real descendant as related site.
 */
function validatePlannedGroups(nodes: readonly Node[], path: SourcePath, emitWith: EmitWith): void {
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (node.planned === true) {
      const real = realDescendants(node.children, [...here, 'children']);
      // Marked `planned` and with Source `path`: it already exists in the code; removing the mark is the fix.
      if (isReal(node)) {
        emitWith([...here, 'planned'], CODES.W_PLANNED_WITH_PATH, `Node '${node.id}' is marked planned but has a Source path, so it already exists in the code; remove planned or the path`, { severity: 'warning', replacement: '' });
      }
      const [first] = real;
      if (first !== undefined) {
        const which = real.length === 1 ? `the real Node '${first.node.id}'` : `${real.length} real Nodes (first '${first.node.id}')`;
        emitWith([...here, 'planned'], CODES.E_REAL_NODE_IN_PLANNED_GROUP, `Group '${node.id}' is marked planned but contains ${which} with a Source path; remove the Group's mark or move the real Nodes out of it`, {
          replacement: '',
          related: { path: [...first.path, 'name'], message: `'${first.node.id}' has a Source path` },
        });
      }
    }
    validatePlannedGroups(node.children, [...here, 'children'], emitWith);
  });
}

function realDescendants(nodes: readonly Node[], path: SourcePath): { node: Node; path: SourcePath }[] {
  return nodes.flatMap((node, index) => [...(isReal(node) ? [{ node, path: [...path, index] }] : []), ...realDescendants(node.children, [...path, index, 'children'])]);
}

function attributesByNode(nodes: readonly Node[], target = new Map<string, string[]>()): Map<string, string[]> {
  for (const node of nodes) {
    target.set(node.id, node.attributes.map((attribute) => attribute.name));
    attributesByNode(node.children, target);
  }
  return target;
}

/** Indices of the Model Edges whose two ends are included in some ER View (the first Node not excluded by `exclude`). */
function erViewEdges(source: CanonicalForm): Set<number> {
  const ids = allIds(source.model.nodes);
  const included = new Set<string>();
  for (const view of source.views) {
    if (view.type !== 'er') continue;
    for (const id of ids) {
      if (view.include.some((selector) => matchesSelector(selector, id)) && !view.exclude.some((selector) => matchesSelector(selector, id))) included.add(`${view.id}\0${id}`);
    }
  }
  const inView = (view: string, id: string): boolean => included.has(`${view}\0${id}`);
  const result = new Set<number>();
  source.model.edges.forEach((edge, index) => {
    if (source.views.some((view) => view.type === 'er' && inView(view.id, edge.from.node) && inView(view.id, edge.to.node))) result.add(index);
  });
  return result;
}

const quoted = (text: string): string => `"${text}"`;

function validateEdges(source: CanonicalForm, emit: Emit): void {
  const attributes = attributesByNode(source.model.nodes);
  const inErView = erViewEdges(source);
  source.model.edges.forEach((edge, index) => {
    if (inErView.has(index)) {
      for (const field of ['fromCardinality', 'toCardinality'] as const) {
        const written = edge[field];
        if (written === undefined || (ER_CARDINALITIES as readonly string[]).includes(written)) continue;
        emit(['model', 'edges', index, field], CODES.E_ER_CARDINALITY, `Cardinality '${written}' is not valid in an ER View (${ER_CARDINALITIES.join(' | ')})`, written, ER_CARDINALITIES, quoted, `Cardinalidades validas: ${ER_CARDINALITIES.join(', ')}`);
      }
    }
    for (const side of ['from', 'to'] as const) {
      const { node, attribute } = edge[side];
      const ofNode = attributes.get(node);
      const path = ['model', 'edges', index, side];
      if (ofNode === undefined) {
        emit([...path, 'node'], CODES.E_DANGLING_EDGE, `Dangling Edge: Node '${node}' does not exist in the Model`, node, attributes.keys());
      } else if (attribute !== undefined && !ofNode.includes(attribute)) {
        emit([...path, 'attribute'], CODES.E_UNKNOWN_ATTRIBUTE, `Node '${node}' has no Attribute '${attribute}'`, attribute, ofNode);
      }
    }
  });
}

const paletteNames = (themes: readonly Theme[]): string[] => themes.flatMap((theme) => Object.keys(theme.palette));

function validateCatalog(source: CanonicalForm, icons: IconProvider | undefined, emit: Emit): void {
  const palette = paletteNames(source.themes);
  source.specification.nodeTypes.forEach((kind, index) => {
    const path = ['specification', 'nodeTypes', index];
    if (icons !== undefined && kind.icon !== undefined && icons.resolve(kind.icon) === undefined) {
      emit(
        [...path, 'icon'],
        CODES.E_UNKNOWN_ICON,
        `Icon '${kind.icon}' does not exist (neither a generic icon nor an SVG in the Workspace)`,
        kind.icon,
        icons.keys(),
      );
    }
    if (kind.color !== undefined && !palette.includes(kind.color)) {
      emit([...path, 'color'], CODES.E_UNKNOWN_PALETTE_COLOR, `Color '${kind.color}' is not a Palette name of the Theme`, kind.color, new Set(palette));
    }
  });
}

function validateView(source: CanonicalForm, view: View, index: number, emit: Emit, emitWith: EmitWith): void {
  const path = ['views', index];
  const ids = source.views.map(({ id }) => id);

  const theme = source.themes.find((candidate) => candidate.name === view.theme);
  const newTheme = view.theme === undefined ? undefined : oldRename(OLD_CATALOG_VALUES, 'theme', view.theme);
  if (view.theme !== undefined && theme === undefined && newTheme !== undefined && source.themes.some(({ name }) => name === newTheme)) {
    emitWith([...path, 'theme'], CODES.E_OLD_CATALOG_VALUE, oldValueMessage('theme', view.theme, newTheme), { replacement: newTheme });
  } else if (view.theme !== undefined && theme === undefined) {
    emit([...path, 'theme'], CODES.E_UNKNOWN_THEME, `Theme '${view.theme}' is not declared`, view.theme, source.themes.map(({ name }) => name));
  }
  const palette = paletteNames(theme ? [theme] : source.themes);
  view.overrides.forEach((override, i) => {
    if (override.color !== undefined && !palette.includes(override.color)) {
      emit([...path, 'overrides', i, 'color'], CODES.E_UNKNOWN_PALETTE_COLOR, `Color '${override.color}' is not a Palette name of the Theme`, override.color, new Set(palette));
    }
  });

  // In sequence the View does not select Nodes: any non-excluded one is valid (merged Lifeline or `box` of a Group).
  const ofSequence = view.type === 'sequence' ? nonExcludedNodes(source.model.nodes, view) : undefined;
  const visible = ofSequence ?? new Set(resolveView(source, view.id)?.nodes.map((node) => node.id));
  view.overrides.forEach((override, i) => {
    if (!visible.has(override.node)) {
      emit([...path, 'overrides', i, 'node'], CODES.E_OVERRIDE_OUTSIDE_VIEW, `Override on '${override.node}', which View '${view.id}' does not show`);
    }
  });

  const groups = new Set(
    ofSequence === undefined
      ? resolveView(
          { ...source, views: [{ ...view, collapsed: [], expanded: [], links: [], depth: undefined }] },
          view.id,
        )?.nodes.filter((node) => node.childCount > 0).map((node) => node.id)
      : [...ofSequence].filter((id) => groupsOf(source.model.nodes).has(id)),
  );
  const linked = new Set(view.links.map(({ node }) => node));
  view.links.forEach((link, i) => {
    if (!ids.includes(link.view)) {
      emit([...path, 'links', i, 'view'], CODES.E_UNKNOWN_VIEW_LINK, `link to View '${link.view}', which does not exist`, link.view, ids);
    }
  });
  // In sequence `expanded` already gives view-property-for-type; no other Issue is emitted about it.
  for (const word of view.type === 'sequence' ? (['collapsed'] as const) : (['collapsed', 'expanded'] as const)) {
    view[word].forEach((target, i) => {
      const where = [...path, word, i];
      if (!groups.has(target)) {
        emit(where, CODES.E_INVALID_EXPANSION_TARGET, `'${word} ${target}': not a Group that View '${view.id}' shows`);
      } else if (word === 'expanded' && linked.has(target)) {
        emit(where, CODES.E_LINK_WITH_EXPANDED, `'${target}' has both 'link' and 'expanded': a Group with a link is not expanded`);
      }
    });
  }

  const nodes = allIds(source.model.nodes);
  view.steps.forEach((step, s) => {
    if (view.type === 'sequence') return;
    for (const action of ['show', 'hide'] as const) {
      step[action].forEach((item: StepElement, k) => {
        const where = [...path, 'steps', s, action, k];
        if ('selector' in item) {
          if (nodes.some((id) => matchesSelector(item.selector, id))) return;
          emit([...where, 'selector'], CODES.E_UNKNOWN_STEP, `Selector '${item.selector}' matches no Node in the Model`, item.selector, nodes);
        } else if (!source.model.edges.some((edge) => edge.from.node === item.from && edge.to.node === item.to)) {
          emit([...where, 'from'], CODES.E_UNKNOWN_STEP, `Edge '${item.from} -> ${item.to}' does not exist in the Model`, item.from, nodes);
        }
      });
    }
  });
}

/** Interactions: unique ids, Message ends that are Nodes, unique Message ids and `reply` without an open `sync`. */
function validateInteractions(source: CanonicalForm, emit: Emit, emitWith: EmitWith): void {
  const nodes = allIds(source.model.nodes);
  const views = new Map<string, number>();
  source.model.interactions.forEach((interaction, i) => {
    const path = ['model', 'interactions', i];
    const previous = views.get(interaction.id);
    if (previous !== undefined) {
      emitWith([...path, 'id'], CODES.E_DUPLICATE_INTERACTION, `Duplicate Interaction '${interaction.id}'`, { related: { path: ['model', 'interactions', previous, 'id'], message: `First declaration of '${interaction.id}'` } });
    } else {
      views.set(interaction.id, i);
    }
    const ids = new Map<string, (string | number)[]>();
    const messages = flattenMessages(interaction.items);
    messages.forEach((message, j) => {
      const where = [...path, ...message.location];
      for (const side of ['from', 'to'] as const) {
        if (!nodes.includes(message[side])) {
          emit([...where, side], CODES.E_UNKNOWN_LIFELINE, `The end '${message[side]}' of the Message is not a Node of the Model`, message[side], nodes);
        }
      }
      validateLifecycle(message, j, path, messages, emitWith);
      if (message.id === undefined) return;
      const other = ids.get(message.id);
      if (other === undefined) ids.set(message.id, message.location);
      else emitWith([...where, 'id'], CODES.E_DUPLICATE_MESSAGE_ID, `Duplicate Message '${message.id}' in Interaction '${interaction.id}'`, { related: { path: [...path, ...other, 'id'], message: `First Message '${message.id}'` } });
    });
    validateOperands(interaction.items, [...path, 'items'], emitWith);
    validateNotesAndRefs(interaction.items, [...path, 'items'], source, nodes, emit, emitWith);
    for (const j of activationsOf(messages).looseReplies) {
      const message = messages[j]!;
      emitWith([...path, ...message.location, 'from'], CODES.W_REPLY_WITHOUT_SYNC, `The 'reply' from '${message.from}' to '${message.to}' closes no open 'sync'`, { severity: 'warning' });
    }
  });
}

/** `create` only at the target's first appearance and no appearance after its `destroy` (the first one to happen), in declaration order even inside Fragments. */
function validateLifecycle(message: LocatedMessage, j: number, path: (string | number)[], messages: readonly LocatedMessage[], emitWith: EmitWith): void {
  const earlier = messages.slice(0, j);
  const first = earlier.findIndex((m) => m.from === message.to || m.to === message.to);
  if (message.kind === 'create' && first >= 0) {
    emitWith([...path, ...message.location, 'to'], CODES.E_CREATE_NOT_FIRST, `'create' on '${message.to}', which already appears earlier in the Interaction`, { related: { path: [...path, ...earlier[first]!.location, earlier[first]!.from === message.to ? 'from' : 'to'], message: `First appearance of '${message.to}'` } });
    return;
  }
  for (const side of ['from', 'to'] as const) {
    const destruction = earlier.find((m) => m.kind === 'destroy' && m.to === message[side]);
    if (destruction !== undefined) {
      emitWith([...path, ...message.location, side], CODES.E_AFTER_DESTROY, `'${message[side]}' appears after its 'destroy'`, { related: { path: [...path, ...destruction.location, 'to'], message: `'${message[side]}' is destroyed here` } });
      return;
    }
  }
}

/** `where`: one path per appearance in the View. */
interface SequenceOnlyProperty {
  name: string;
  where: (view: View) => Array<Array<string | number>>;
  hint: string;
}

const SEQUENCE_ONLY_PROPERTIES: readonly SequenceOnlyProperty[] = [
  { name: 'interaction', where: (v) => (v.interaction === undefined ? [] : [['interaction']]), hint: "change 'type' to sequence or remove 'interaction'" },
  { name: 'autonumber', where: (v) => (v.autonumber === true ? [['autonumber']] : []), hint: "change 'type' to sequence or remove 'autonumber'" },
  { name: 'order', where: (v) => (v.order.length > 0 ? [['order', 0]] : []), hint: "change 'type' to sequence or remove 'order'" },
  { name: 'steps each', where: (v) => (v.stepsEach === true ? [['stepsEach']] : []), hint: "use 'step { show ... }' or change 'type' to sequence" },
  { name: 'upto', where: (v) => v.steps.flatMap((step, s) => (step.upto === undefined ? [] : [['steps', s, 'upto']])), hint: "use 'show'/'hide' or change 'type' to sequence" },
];

/** View properties by Diagram type, and the Interaction a sequence View projects. */
function validateSequenceView(source: CanonicalForm, view: View, index: number, emit: Emit, emitWith: EmitWith): void {
  const path = ['views', index];
  const interactions = source.model.interactions.map(({ id }) => id);
  if (view.type !== 'sequence') {
    for (const property of SEQUENCE_ONLY_PROPERTIES) {
      for (const where of property.where(view)) {
        emitWith([...path, ...where], CODES.E_VIEW_PROPERTY_FOR_TYPE, `'${property.name}' is only valid in a 'sequence' View, not in '${view.type}'`, { hint: property.hint });
      }
    }
    return;
  }
  if (view.include.length > 0) {
    emitWith([...path, 'include'], CODES.E_VIEW_PROPERTY_FOR_TYPE, "'include' is not valid in a 'sequence' View: it projects an Interaction", { hint: "use 'exclude' to remove Lifelines" });
  }
  if (view.expanded.length > 0) {
    emitWith([...path, 'expanded', 0], CODES.E_VIEW_PROPERTY_FOR_TYPE, "'expanded' is not valid in a 'sequence' View: Lifelines are merged with 'collapsed' or 'depth'", { hint: "remove 'expanded'; use 'collapsed' or 'depth' to merge Groups" });
  }
  view.overrides.forEach((override, i) => {
    if (override.pin !== undefined) {
      emitWith([...path, 'overrides', i, 'pin'], CODES.E_VIEW_PROPERTY_FOR_TYPE, "'pin' is not valid in a 'sequence' View: columns follow the order of the Lifelines", { hint: "use 'order' to reorder Lifelines" });
    }
  });
  const interaction = source.model.interactions.find(({ id }) => id === view.interaction);
  if (view.interaction === undefined) {
    emitWith([...path, 'id'], CODES.E_SEQUENCE_WITHOUT_INTERACTION, `View '${view.id}' is 'sequence' and does not declare 'interaction'`, interactions.length > 0 ? { hint: `Interactions: ${interactions.join(', ')}` } : {});
  } else if (interaction === undefined) {
    emit([...path, 'interaction'], CODES.E_UNKNOWN_INTERACTION, `Interaction '${view.interaction}' does not exist in the Model`, view.interaction, interactions);
  }
  validateSequenceSteps(source, view, index, interaction, emit, emitWith);
  const nodes = allIds(source.model.nodes);
  const participants = new Set(flattenMessages(interaction?.items ?? []).flatMap((m) => [m.from, m.to]));
  if (interaction !== undefined) {
    // A Lifeline is a participant, or a Group that contains one (when `depth`/`collapsed` merge them into it).
    const possible = nonExcludedNodes(source.model.nodes, view);
    const lifelines = new Set([...participants].flatMap((id) => id.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'))).filter((id) => possible.has(id)));
    view.links.forEach((link, i) => {
      if (!lifelines.has(link.node)) {
        emitWith([...path, 'links', i, 'view'], CODES.E_LINK_NOT_LIFELINE, `'link ${link.node}': in a 'sequence' View only a Lifeline can link, and '${link.node}' is not one`, { hint: 'link from a Lifeline (a Node that takes part in the Interaction); a Message, Note or Fragment does not navigate by link' });
      }
    });
  }
  view.order.forEach((id, i) => {
    if (!nodes.includes(id)) {
      emit([...path, 'order', i], CODES.E_UNKNOWN_LIFELINE, `'order' names '${id}', which is not a Node of the Model`, id, nodes);
    } else if (interaction !== undefined && !participants.has(id)) {
      emitWith([...path, 'order', i], CODES.W_ORDER_NOT_IN_INTERACTION, `'${id}' does not take part in Interaction '${interaction.id}'; 'order' ignores it`, { severity: 'warning' });
    }
  });
}

/** Sequence Steps: `show`/`hide` are not valid; `upto` names a projected Message and moves forward; `steps each` does not coexist with `step`. */
function validateSequenceSteps(source: CanonicalForm, view: View, index: number, interaction: Interaction | undefined, emit: Emit, emitWith: EmitWith): void {
  const path = ['views', index];
  const messages = flattenMessages(interaction?.items ?? []);
  const resolved = interaction === undefined ? undefined : resolveView(source, view.id);
  const projected = resolved?.type === 'sequence' ? resolved.interaction.messages : [];
  const position = new Map(projected.flatMap((m, i) => (m.id === undefined ? [] : [[m.id, i] as const])));
  const ids = messages.flatMap((m) => (m.id === undefined ? [] : [m.id]));
  if (view.stepsEach === true && view.steps.length > 0) {
    emitWith([...path, 'steps', 0, 'title'], CODES.E_STEPS_EACH_WITH_STEP, "explicit 'steps each' and 'step' cannot be combined in the same View", { hint: "keep only 'steps each' or only the 'step { upto ... }' blocks" });
  }
  let previous: { index: number; step: number } | undefined;
  view.steps.forEach((step, s) => {
    for (const action of ['show', 'hide'] as const) {
      step[action].forEach((item: StepElement, k) => {
        emitWith([...path, 'steps', s, action, k, 'selector' in item ? 'selector' : 'from'], CODES.E_VIEW_PROPERTY_FOR_TYPE, `'${action}' is not valid in a 'sequence' View: a Step is a cut in time`, { hint: "use 'step { upto <Message id> }'" });
      });
    }
    if (step.upto === undefined || interaction === undefined) return;
    const where = [...path, 'steps', s, 'upto'];
    if (!ids.includes(step.upto)) {
      emit(where, CODES.E_UNKNOWN_STEP, `Message '${step.upto}' does not exist in Interaction '${interaction.id}'`, step.upto, ids, undefined, ids.length === 0 ? "give a Message an id: 'id: a -> b'" : undefined);
      return;
    }
    const current = position.get(step.upto);
    if (current === undefined) {
      emitWith(where, CODES.E_STEP_NOT_PROJECTED, `Message '${step.upto}' is not in View '${view.id}' ('depth' or 'exclude' removes it)`, { hint: "pick a Message the View projects or remove the 'exclude'" });
      return;
    }
    if (previous !== undefined && current <= previous.index) {
      emitWith(where, CODES.E_STEP_NOT_ADVANCING, `Step '${step.title}' does not advance: '${step.upto}' is not after the previous Step`, { hint: 'sequence Steps only move forward', related: { path: [...path, 'steps', previous.step, 'upto'], message: 'Previous Step' } });
      return;
    }
    previous = { index: current, step: s };
  });
}

function nonExcludedNodes(nodes: readonly Node[], view: View): Set<string> {
  const all = allIds(nodes);
  return new Set(all.filter((id) => !view.exclude.some((selector) => matchesSelector(selector, id))));
}

function groupsOf(nodes: readonly Node[], target = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.children.length > 0) target.add(node.id);
    groupsOf(node.children, target);
  }
  return target;
}

function allIds(nodes: readonly Node[]): string[] {
  return nodes.flatMap((node) => [node.id, ...allIds(node.children)]);
}

function compareIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}

/** Notes on Nodes that exist and `ref` to Interactions that exist (`fix` for typos); a `ref` no sequence View projects warns. */
function validateNotesAndRefs(items: readonly InteractionItem[], path: SourcePath, source: CanonicalForm, nodes: readonly string[], emit: Emit, emitWith: EmitWith): void {
  items.forEach((item, i) => {
    const where = [...path, i];
    if (item.type === 'note') {
      item.targets.forEach((id, t) => {
        if (!nodes.includes(id)) emit([...where, 'targets', t], CODES.E_UNKNOWN_LIFELINE, `The target '${id}' of the Note is not a Node of the Model`, id, nodes);
      });
    } else if (item.type === 'ref') {
      if (!source.model.interactions.some(({ id }) => id === item.interaction)) {
        emit([...where, 'interaction'], CODES.E_UNKNOWN_INTERACTION, `Interaction '${item.interaction}' referenced by 'ref' does not exist in the Model`, item.interaction, source.model.interactions.map(({ id }) => id));
      } else if (refTarget(source.views, item.interaction) === undefined) {
        emitWith([...where, 'interaction'], CODES.W_REF_WITHOUT_VIEW, `No sequence View projects Interaction '${item.interaction}' referenced by 'ref': the frame does not navigate`, { severity: 'warning', hint: `add a View: view ${item.interaction} { type sequence interaction ${item.interaction} }` });
      }
    } else if (item.type === 'fragment') {
      item.operands.forEach((operand, k) => validateNotesAndRefs(operand.items, [...where, 'operands', k, 'items'], source, nodes, emit, emitWith));
    }
  });
}

/** Operands of each Fragment (recursive): `else` only in `alt`, `and` only in `par`; one operand in the other operators. */
function validateOperands(items: readonly InteractionItem[], path: SourcePath, emitWith: EmitWith): void {
  items.forEach((item, i) => {
    if (item.type !== 'fragment') return;
    const where = [...path, i];
    const expected = item.operator === 'alt' ? 'else' : item.operator === 'par' ? 'and' : undefined;
    item.operands.forEach((operand, k) => {
      if (k > 0) {
        if (expected === undefined) {
          emitWith([...where, 'operands', k, 'separator'], CODES.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' has a single operand; it does not accept '${operand.separator}'`, { hint: `remove the operand or use 'alt { } else { }' / 'par { } and { }'` });
        } else if (operand.separator !== expected) {
          emitWith([...where, 'operands', k, 'separator'], CODES.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' separates its operands with '${expected}', not with '${operand.separator}'`, { hint: `write '${expected}' (\`else\` belongs to \`alt\`, \`and\` to \`par\`)` });
        }
      }
      validateOperands(operand.items, [...where, 'operands', k, 'items'], emitWith);
    });
  });
}
