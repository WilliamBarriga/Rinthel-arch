/**
 * Maps the path of a value of the Canonical form to the DSL text it came from. Invariant: the lists of
 * the Canonical form keep the AST order, so index `i` of the Canonical form is the `i`-th of the AST.
 */
import type { CanonicalForm, TextSite, TextRange, Locator } from 'canonical';

import type { Edge, Element, Fragment, Interaction, NodeTypeDecl, View } from './generated/ast';
import { toRange, emptyPoint, rangeOf, rangeOfIndex, rangeOfMark } from './positions';
import { GrammarUtils } from 'langium';
import type { AstNode } from 'langium';

/** Empty point just before the closing `}` of the block (View blocks end in `}`). */
function beforeClosingBrace(node: AstNode): TextRange {
  const end = node.$cstNode?.range.end ?? { line: 0, character: 1 };
  return emptyPoint({ line: end.line, character: end.character - 1 });
}

export interface LocatorData {
  source: CanonicalForm;
  /** Nodes by qualified id, with their AST and file. */
  nodes: ReadonlyMap<string, { file: string; ast: Element }>;
  /** Compiled Edges, in the same order as `source.model.edges`. */
  edges: readonly { file: string; ast: Edge }[];
  /** Interactions, in the same order as `source.model.interactions`. */
  interactions: readonly { file: string; ast: Interaction }[];
  /** Node kinds, in the same order as `source.specification.nodeTypes`. */
  kinds: readonly { file: string; ast: NodeTypeDecl }[];
  /** Views, in the same order as `source.views`. */
  views: readonly { file: string; ast: View }[];
  /** Themes by name: file and range of the name in its declaration. */
  themes: ReadonlyMap<string, { file: string; name: TextRange }>;
  /** Files with broken syntax: their AST is partial and would give false positives. */
  brokenSyntax: ReadonlySet<string>;
}

type ValuePath = readonly (string | number)[];

const site = (file: string, range: TextRange): TextSite => ({ file, range });

export function createLocator(data: LocatorData): Locator {
  return (path) => {
    const [section, index, ...rest] = path;
    if (section === 'model' && index === 'nodes') return ofNode(data, path);
    if (section === 'model' && index === 'edges') return ofEdge(data, rest);
    if (section === 'model' && index === 'interactions') return ofInteraction(data, rest);
    if (section === 'specification') return ofKind(data, rest);
    if (section === 'themes' && rest[0] === 'name') {
      const declared = data.themes.get(data.source.themes[index as number]?.name ?? '');
      return declared === undefined || data.brokenSyntax.has(declared.file) ? null : site(declared.file, declared.name);
    }
    if (section === 'views') return ofView(data, index as number, rest);
    return null;
  };
}

function ofNode({ source, nodes: nodeList }: LocatorData, path: ValuePath): TextSite | null {
  let current: unknown = source;
  for (const key of path.slice(0, path.at(-3) === 'attributes' ? -3 : -1)) current = (current as Record<string | number, unknown>)[key];
  const property = path.at(-1) as string;
  // `[..., 'attributes', j, 'planned']`: Attribute `j` of the Node (those of `attrs { }` first, then the loose ones).
  if (path.at(-3) === 'attributes') {
    const owner = nodeList.get((current as { id: string }).id);
    const attribute = owner === undefined ? undefined : [...owner.ast.attrs.flatMap((block) => block.items), ...owner.ast.attributes][path.at(-2) as number];
    return owner === undefined || attribute === undefined ? null : site(owner.file, rangeOfMark(attribute, property));
  }
  const declared = nodeList.get((current as { id: string }).id);
  if (declared === undefined) return null;
  // The `planned` mark is located with its preceding space: a `fix` that deletes it leaves the text clean.
  return site(declared.file, property === 'planned' ? rangeOfMark(declared.ast, property) : rangeOf(declared.ast, property));
}

function ofEdge({ edges: edgeList }: LocatorData, [i, side, field]: ValuePath): TextSite | null {
  const edge = edgeList[i as number];
  if (edge === undefined) return null;
  // Cardinalities: `path` = [i, 'fromCardinality' | 'toCardinality'], without `field`.
  if (side === 'planned') return site(edge.file, rangeOfMark(edge.ast, 'planned'));
  if (side === 'fromCardinality' || side === 'toCardinality') return site(edge.file, rangeOf(edge.ast, side));
  return site(edge.file, rangeOf(edge.ast[side as 'from' | 'to'], field as string));
}

/**
 * `[i, 'id' | 'title']` or `[i, 'items', j, ...]` of an Interaction; inside a Fragment the path continues with
 * `'operands', k, 'items', l`, and ends in `from | to | id` (Message) or `separator` (operand).
 */
function ofInteraction({ interactions: interactionList }: LocatorData, [i, field, ...rest]: ValuePath): TextSite | null {
  const interaction = interactionList[i as number];
  if (interaction === undefined) return null;
  if (field === 'items') {
    let node: AstNode | undefined = undefined;
    let list: readonly AstNode[] = interaction.ast.items;
    let k = 0;
    for (; k < rest.length; k++) {
      const key = rest[k]!;
      if (typeof key === 'number') {
        node = list[key];
        if (node === undefined) return null;
      } else if (key === 'operands') {
        const operand: AstNode | undefined = (node as Fragment | undefined)?.operands[rest[++k] as number];
        if (operand === undefined) return null;
        node = operand;
      } else if (key === 'items') {
        list = (node as { items?: readonly AstNode[] } | undefined)?.items ?? [];
      } else {
        break;
      }
    }
    const property = rest[k] as string | undefined;
    if (node === undefined) return null;
    if (property === 'targets' && typeof rest[k + 1] === 'number') return site(interaction.file, rangeOfIndex(node, 'targets', rest[k + 1] as number));
    return site(interaction.file, property === undefined ? toRange(node.$cstNode?.range) : rangeOf(node, property === 'id' ? 'alias' : property));
  }
  if (field === 'planned') return site(interaction.file, rangeOfMark(interaction.ast, 'planned'));
  return site(interaction.file, rangeOf(interaction.ast, field === 'id' ? 'name' : (field as string)));
}

/** Value of the property `key` (`icon` or `color`) of the `i`-th Node kind. */
function ofKind({ kinds, brokenSyntax }: LocatorData, [i, key]: ValuePath): TextSite | null {
  const kind = kinds[i as number];
  const prop = kind?.ast.props.find((candidate) => candidate.key === key);
  if (kind === undefined || prop === undefined || brokenSyntax.has(kind.file)) return null;
  return site(kind.file, rangeOf(prop, 'value'));
}

function ofView(data: LocatorData, index: number, path: ValuePath): TextSite | null {
  const view = data.views[index];
  if (view === undefined || data.brokenSyntax.has(view.file)) return null;
  const { file, ast } = view;
  const [field, i, ...tail] = path;
  const props = ast.props;

  if (field === 'id') return site(file, rangeOf(ast, 'name'));
  if (field === 'cuerpo') {
    // `['views', n, 'cuerpo']`: empty point just after the View's `{` (where its first statement goes).
    const brace = GrammarUtils.findNodesForKeyword(ast.$cstNode, '{')[0];
    return brace === undefined ? null : site(file, emptyPoint(brace.range.end));
  }
  if (field === 'theme') {
    const theme = props.find((prop) => prop.$type === 'ViewTheme');
    if (theme === undefined) return null;
    // `['views', n, 'theme', 'sentencia']`: the whole `theme <name> { patch }` statement; without a tail, the name.
    if (i === 'sentencia') return theme.$cstNode === undefined ? null : site(file, toRange(theme.$cstNode.range));
    return site(file, rangeOf(theme, 'value'));
  }
  if (field === 'overrides') {
    // `['views', n, 'overrides']` without an index: where to insert a new override (before the View's `}`).
    if (i === undefined) return site(file, beforeClosingBrace(ast));
    const override = props.filter((prop) => prop.$type === 'NodeOverride')[i as number];
    if (override === undefined) return null;
    if (tail[0] === 'pin') {
      const pin = override.props.find((prop) => prop.$type === 'OverridePin');
      if (pin?.$cstNode !== undefined) return site(file, toRange(pin.$cstNode.range));
      // No pin: empty point where to insert it, after the last property or after the `{`.
      const last = override.props.at(-1)?.$cstNode;
      if (last !== undefined) return site(file, emptyPoint(last.range.end));
      const brace = GrammarUtils.findNodesForKeyword(override.$cstNode, '{')[0];
      return brace === undefined ? null : site(file, emptyPoint(brace.range.end));
    }
    if (tail[0] === 'node') return site(file, rangeOf(override, 'node'));
    const color = override.props.find((prop) => prop.$type === 'OverrideColor');
    return color === undefined ? null : site(file, rangeOf(color, 'value'));
  }
  if (field === 'interaction') {
    const prop = props.find((p) => p.$type === 'ViewInteraction');
    return prop === undefined ? null : site(file, rangeOf(prop, 'value'));
  }
  if (field === 'autonumber') {
    const prop = props.find((p) => p.$type === 'ViewAutonumber');
    return prop?.$cstNode === undefined ? null : site(file, toRange(prop.$cstNode.range));
  }
  if (field === 'order') {
    let rest = i as number;
    for (const prop of props) {
      if (prop.$type !== 'ViewOrder') continue;
      if (rest < prop.targets.length) return site(file, rangeOfIndex(prop, 'targets', rest));
      rest -= prop.targets.length;
    }
    return null;
  }
  if (field === 'include') {
    const prop = props.find((p) => p.$type === 'ViewInclude');
    return prop?.$cstNode === undefined ? null : site(file, toRange(prop.$cstNode.range));
  }
  if (field === 'links') {
    const link = props.filter((prop) => prop.$type === 'ViewLink')[i as number];
    return link === undefined ? null : site(file, rangeOf(link, 'view'));
  }
  if (field === 'collapsed' || field === 'expanded') {
    const className = field === 'collapsed' ? 'ViewCollapsed' : 'ViewExpanded';
    let rest = i as number;
    for (const prop of props) {
      if (prop.$type !== className) continue;
      if (rest < prop.targets.length) return site(file, rangeOfIndex(prop, 'targets', rest));
      rest -= prop.targets.length;
    }
    return null;
  }
  if (field === 'stepsEach') {
    const prop = props.find((p) => p.$type === 'ViewSteps' && p.each);
    return prop?.$cstNode === undefined ? null : site(file, toRange(prop.$cstNode.range));
  }
  if (field === 'steps') {
    const step = props.flatMap((prop) => (prop.$type === 'ViewSteps' ? prop.steps : []))[i as number];
    const [action, k, property] = tail;
    if (action === 'title') return step === undefined ? null : site(file, rangeOf(step, 'title'));
    if (action === 'upto') {
      const upto = step?.actions.find((a) => a.$type === 'StepUpto');
      return upto === undefined ? null : site(file, rangeOf(upto, 'target'));
    }
    const className = action === 'show' ? 'StepShow' : 'StepHide';
    const item = step?.actions.flatMap((a) => (a.$type === className ? a.items : []))[k as number];
    return item === undefined ? null : site(file, rangeOf(item, property as string));
  }
  return null;
}
