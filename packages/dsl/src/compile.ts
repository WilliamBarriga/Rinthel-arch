/** Parses each file with Langium and translates the AST to the Canonical form. Pure: does not read disk. */
import { CODES, VIEW_TYPES, combineIconProviders, canonicalFormSchema, genericIcons, validate, viewSchema, workspaceIcons } from 'canonical';
import type {
  Edge as Arista,
  Attribute as Atributo,
  AttributeKey,
  StepElement,
  Endpoint,
  CanonicalForm,
  Interaction as Interaccion,
  InteractionItem as ItemDeInteraccion,
  Issue,
  Node,
  NodeOverride as OverrideDeNodo,
  Step as Paso,
  OpaqueReference,
  NodeKind,
  Locator,
  View as Vista,
} from 'canonical';
import {
  EmptyFileSystem,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';
import type { LangiumCoreServices, ParseResult } from 'langium';

import { DiagramsGeneratedModule, DiagramsGeneratedSharedModule } from './generated/module';
import type { Attrs, Attribute, DiagramFile, Edge, Element, Extend, Interaction, InteractionItem, NodeOverride, NodeTypeDecl, Source, Step, View } from './generated/ast';
import { issueWithSuggestion, rangeOf, rangeOfIndex } from './positions';
import { BUILT_IN_FILE, builtInThemes } from './built-in-themes';
import { resolveThemes } from './themes';
import type { PartDeclaration, ThemeOrigin, DeclaredTheme } from './themes';
import { createLocator } from './locator';

/** Map path -> text of the Workspace. */
export type WorkspaceFiles = Readonly<Record<string, string>>;

/** Text site where a View sets the `pin` of a Node. */
export interface PinPosition {
  view: string;
  node: string;
  file: string;
  line: number;
  column: number;
}

export interface CompileResult {
  /** Present only if there are no issues with severity `error`. */
  canonical?: CanonicalForm;
  /** Every issue, sorted by file, line, column and code. */
  issues: Issue[];
  /** Position of each override with `pin`, in order of appearance. */
  pins: PinPosition[];
  /** Where each value of the Canonical form was written; present together with `canonical`. */
  locate?: Locator;
  /** Origin of the Layers of each declared Theme (`extends` chain, `part`s used and site of each Layer); present together with `canonical`. */
  themeOrigins?: Record<string, ThemeOrigin>;
}

let memoServices: LangiumCoreServices | undefined;

/**
 * Langium services, memoized: creating them costs ~100 ms against ~1 ms to compile.
 * Unobservable: `parser.LangiumParser` keeps no state between `parse` calls.
 */
function services(): LangiumCoreServices {
  if (memoServices === undefined) {
    const shared = inject(createDefaultSharedCoreModule(EmptyFileSystem), DiagramsGeneratedSharedModule);
    memoServices = inject(createDefaultCoreModule({ shared }), DiagramsGeneratedModule);
    shared.ServiceRegistry.register(memoServices);
  }
  return memoServices;
}

export function compile(workspace: WorkspaceFiles): CompileResult {
  const issues: Issue[] = [];
  const nodeKinds: NodeKind[] = [];
  const brokenSyntax = new Set<string>();
  const declaredThemes: DeclaredTheme[] = builtInThemes((text) => services().parser.LangiumParser.parse<DiagramFile>(text).value).map((theme) => ({
    file: BUILT_IN_FILE,
    ast: theme,
    name: rangeOf(theme, 'name'),
    parent: rangeOf(theme, 'parent'),
  }));
  const declaredParts: PartDeclaration[] = [];
  const kindAsts: { file: string; ast: NodeTypeDecl }[] = [];
  const viewList: { vista: Vista; file: string; ast: View }[] = [];
  const roots: { file: string; elementos: Element[]; edges: Edge[]; extensiones: Extend[]; interactions: Interaction[] }[] = [];

  for (const file of Object.keys(workspace).sort()) {
    if (file.endsWith('.svg')) continue;
    const text = workspace[file] as string;
    const result = services().parser.LangiumParser.parse<DiagramFile>(text);
    const syntaxIssues = syntaxIssuesOf(file, text, result);
    issues.push(...syntaxIssues);
    if (syntaxIssues.length > 0) brokenSyntax.add(file);

    for (const spec of result.value.specifications) {
      for (const decl of spec.nodeTypes) {
        const kind: NodeKind = { name: decl.name, description: '' };
        for (const prop of decl.props) {
          const value = prop.value;
          if (prop.key === 'description') kind.description = value;
          else kind[prop.key] = value;
        }
        nodeKinds.push(kind);
        kindAsts.push({ file, ast: decl });
      }
    }
    for (const theme of result.value.themes) {
      declaredThemes.push({
        file: file,
        ast: theme,
        name: rangeOf(theme, 'name'),
        parent: rangeOf(theme, 'parent'),
      });
    }
    for (const part of result.value.parts) {
      declaredParts.push({ file, ast: part, name: rangeOf(part, 'name') });
    }
    for (const view of result.value.views) {
      const compiledOne = compileView(view, file, issues);
      if (compiledOne !== undefined) viewList.push({ vista: compiledOne, file, ast: view });
    }
    for (const model of result.value.models) {
      roots.push({
        file: file,
        elementos: model.elements,
        edges: model.edges,
        extensiones: model.extensions,
        interactions: model.interactions,
      });
    }
  }

  const registry = new Map<string, RegisteredNode>();
  const context: Context = { registry, issues };
  const nodeList: Node[] = [];
  for (const { file, elementos: elements } of roots) {
    for (const element of elements) {
      const node = compileElement(element, '', file, context);
      if (node !== undefined) nodeList.push(node);
    }
  }
  applyExtensions(roots.flatMap(({ file, extensiones: extensions }) => extensions.map((extension) => ({ file, extension }))), context);

  const edgeList: Arista[] = [];
  const edgeAsts: { file: string; ast: Edge }[] = [];
  for (const { file, edges: ofFile } of roots) {
    // With broken syntax the AST is partial: its Edges would give false dangling ends.
    if (brokenSyntax.has(file)) continue;
    for (const edge of ofFile) {
      edgeList.push(compileEdge(edge));
      edgeAsts.push({ file, ast: edge });
    }
  }

  const interactionList: Interaccion[] = [];
  const interactionAsts: { file: string; ast: Interaction }[] = [];
  for (const { file, interactions: ofFile } of roots) {
    // With broken syntax the AST is partial: its Messages would give false unknown endpoints.
    if (brokenSyntax.has(file)) continue;
    for (const interaction of ofFile) {
      interactionList.push(compileInteraction(interaction));
      interactionAsts.push({ file, ast: interaction });
    }
  }

  const { themes: themeList, issues: ofTheme, parchesDeVista: viewPatches, origins: themeOrigins } = resolveThemes(declaredThemes, declaredParts, nodeKinds.map(({ name }) => name));
  issues.push(...ofTheme);
  for (const { vista: view, file, ast } of viewList) {
    const block = ast.props.find((prop) => prop.$type === 'ViewTheme');
    if (block === undefined || block.items.length === 0 || view.theme === undefined) continue;
    const { ops, issues: ofOverride } = viewPatches(view.theme, block.items, file);
    issues.push(...ofOverride);
    if (ops.length > 0) view.themePatch = ops.map((op) => ({ ...op }));
  }
  const source: CanonicalForm = {
    themes: themeList,
    specification: { nodeTypes: nodeKinds },
    model: { nodes: nodeList, edges: edgeList, interactions: interactionList },
    views: viewList.map(({ vista: view }) => view),
  };
  const locate = createLocator({
    source: source,
    nodes: new Map([...registry].map(([id, { origin, ast }]) => [id, { file: origin.file, ast }])),
    edges: edgeAsts,
    interactions: interactionAsts,
    kinds: kindAsts,
    views: viewList.map(({ file, ast }) => ({ file, ast })),
    themes: new Map(declaredThemes.map(({ file, ast, name }) => [ast.name, { file, name }])),
    brokenSyntax: brokenSyntax,
  });
  // A declared Theme that did not resolve already has its error (`ofTheme`); it is not reported again as undeclared.
  const unresolved = new Set(declaredThemes.map(({ ast }) => ast.name).filter((name) => !themeList.some((t) => t.name === name)));
  const withoutTheme = (issue: Issue): boolean => issue.code === CODES.E_UNKNOWN_THEME && viewList.some(({ vista: view }) => view.theme !== undefined && unresolved.has(view.theme) && issue.message === `Theme '${view.theme}' is not declared`);
  issues.push(...validate(source, { icons: combineIconProviders(workspaceIcons(workspace), genericIcons()), locate }).filter((issue) => !withoutTheme(issue)));

  const pins: PinPosition[] = [];
  for (const { vista: view, file, ast } of viewList) {
    // With broken syntax the AST is partial: its overrides would give false positives.
    if (!brokenSyntax.has(file)) pins.push(...pinPositions(view, ast, file));
  }

  issues.sort(compareIssues);
  if (issues.some((issue) => issue.severity === 'error')) return { issues, pins };
  return {
    canonical: canonicalFormSchema.parse(source),
    issues,
    pins,
    locate: locate,
    themeOrigins: themeOrigins,
  };
}

interface RegisteredNode {
  node: Node;
  ast: Element;
  origin: { file: string; line: number; column: number };
}

interface Context {
  registry: Map<string, RegisteredNode>;
  issues: Issue[];
}

/** Compiles a View; without a valid `type` it is `unknown-view-type` and there is no View. */
function compileView(view: View, file: string, issues: Issue[]): Vista | undefined {
  const kind = view.props.find((prop) => prop.$type === 'ViewType');
  if (kind === undefined) {
    issues.push({
      code: CODES.E_UNKNOWN_VIEW_TYPE,
      severity: 'error',
      file: file,
      ...rangeOf(view, 'name').start,
      message: `View '${view.name}' does not declare 'type' (${VIEW_TYPES.join(' | ')})`,
    });
    return undefined;
  }
  const validKind = viewSchema.shape.type.safeParse(kind.value);
  if (!validKind.success) {
    issues.push(
      issueWithSuggestion(
        { code: CODES.E_UNKNOWN_VIEW_TYPE, message: `Unknown View type '${kind.value}' (${VIEW_TYPES.join(' | ')})` },
        file, kind, 'value', VIEW_TYPES,
      ),
    );
    return undefined;
  }
  const selectors = (className: 'ViewInclude' | 'ViewExclude'): string[] =>
    view.props.flatMap((prop) => (prop.$type === className ? prop.selectors : []));
  const depthValue = view.props.find((prop) => prop.$type === 'ViewDepth');
  const theme = view.props.find((prop) => prop.$type === 'ViewTheme');
  const interaction = view.props.find((prop) => prop.$type === 'ViewInteraction');
  return {
    id: view.name,
    type: validKind.data,
    include: selectors('ViewInclude'),
    exclude: selectors('ViewExclude'),
    ...(depthValue !== undefined && { depth: depthValue.value }),
    ...(interaction !== undefined && { interaction: interaction.value }),
    order: view.props.flatMap((prop) => (prop.$type === 'ViewOrder' ? prop.targets : [])),
    ...(view.props.some((prop) => prop.$type === 'ViewAutonumber') && { autonumber: true as const }),
    ...(theme !== undefined && { theme: theme.value }),
    ...(view.props.some((prop) => prop.$type === 'ViewDrill') && { drill: 'collapse' as const }),
    collapsed: view.props.flatMap((prop) => (prop.$type === 'ViewCollapsed' ? prop.targets : [])),
    expanded: view.props.flatMap((prop) => (prop.$type === 'ViewExpanded' ? prop.targets : [])),
    links: view.props.flatMap((prop) => (prop.$type === 'ViewLink' ? [{ node: prop.node, view: prop.view }] : [])),
    overrides: view.props.flatMap((prop) => (prop.$type === 'NodeOverride' ? [overrideOf(prop)] : [])),
    steps: view.props.flatMap((prop) => (prop.$type === 'ViewSteps' ? prop.steps.map(stepOf) : [])),
    ...(view.props.some((prop) => prop.$type === 'ViewSteps' && prop.each) && { stepsEach: true as const }),
  };
}

function stepOf(step: Step): Paso {
  const items = (className: 'StepShow' | 'StepHide'): StepElement[] =>
    step.actions.flatMap((action) =>
      action.$type === className
        ? action.items.map((item) => (item.$type === 'StepEdge' ? { from: item.from, to: item.to } : { selector: item.selector }))
        : [],
    );
  const upto = step.actions.flatMap((action) => (action.$type === 'StepUpto' ? [action.target] : []))[0];
  return { title: step.title, show: items('StepShow'), hide: items('StepHide'), ...(upto !== undefined && { upto }) };
}

function overrideOf(declared: NodeOverride): OverrideDeNodo {
  const override: OverrideDeNodo = { node: declared.node };
  for (const prop of declared.props) {
    if (prop.$type === 'OverrideLabel') override.label = prop.value;
    else if (prop.$type === 'OverridePin') override.pin = { x: prop.x, y: prop.y };
    else if (prop.$type === 'OverrideOrder') override.order = prop.value;
    else override.color = prop.value;
  }
  return override;
}

function pinPositions(view: Vista, ast: View, file: string): PinPosition[] {
  return ast.props.flatMap((prop) =>
    prop.$type === 'NodeOverride' && prop.props.some((p) => p.$type === 'OverridePin')
      ? [{ view: view.id, node: prop.node, file, ...rangeOf(prop, 'node').start }]
      : [],
  );
}

/** Compiles an Element; an id already declared is `duplicate-node` and the duplicate is discarded. */
function compileElement(
  element: Element,
  prefix: string,
  file: string,
  context: Context,
): Node | undefined {
  const { registry, issues } = context;
  const id = prefix === '' ? element.name : `${prefix}.${element.name}`;
  const { start: site } = rangeOf(element, 'name');
  const original = registry.get(id);
  if (original !== undefined) {
    issues.push({
      code: CODES.E_DUPLICATE_NODE,
      severity: 'error',
      file: file,
      ...site,
      message: `Duplicate Node '${id}'; to extend it from another file use 'extend ${id} { ... }'`,
      related: [{ ...original.origin, message: `First declaration of '${id}'` }],
    });
    return undefined;
  }
  const node: Node = {
    id,
    type: element.type,
    title: element.title ?? element.name,
    description: element.description ?? '',
    attributes: attributesOf(element.attrs, element.attributes, file, issues),
    source: referencesOf(element.sources, file, issues),
    children: [],
    ...(element.planned && { planned: true }),
  };
  registry.set(id, { node, ast: element, origin: { file, ...site } });
  node.children = compileChildren(element.elements, id, file, context);
  return node;
}

function compileChildren(elements: readonly Element[], prefix: string, file: string, context: Context): Node[] {
  return elements.flatMap((child) => compileElement(child, prefix, file, context) ?? []);
}

/**
 * Applies the `extend`s in passes: an `extend` can point to a Node that another
 * `extend` creates (from any file), so it repeats while some pass makes progress.
 * The ones left without a target are `unknown-extend-target`.
 */
function applyExtensions(
  extensions: readonly { file: string; extension: Extend }[],
  context: Context,
): void {
  let pending = extensions;
  while (pending.length > 0) {
    const following = pending.filter(({ file, extension }) => !compileExtension(extension, file, context));
    if (following.length === pending.length) break;
    pending = following;
  }
  for (const { file, extension } of pending) {
    context.issues.push({
      code: CODES.E_UNKNOWN_EXTEND_TARGET,
      severity: 'error',
      file: file,
      ...rangeOf(extension, 'target').start,
      message: `'extend' on Node '${extension.target}', which does not exist in the Model`,
    });
  }
}

/** Adds to the Node `target` the children, Attributes and source of the `extend`; false if the Node does not exist yet. */
function compileExtension(extension: Extend, file: string, context: Context): boolean {
  const goal = context.registry.get(extension.target);
  if (goal === undefined) return false;
  const { node } = goal;
  node.attributes.push(...attributesOf(extension.attrs, extension.attributes, file, context.issues));
  node.source.push(...referencesOf(extension.sources, file, context.issues));
  node.children.push(...compileChildren(extension.elements, node.id, file, context));
  return true;
}

/**
 * Attributes of a Node: those of its `attrs` blocks and the loose ones in the body, in that order.
 * A repeated key mark is `duplicate-key-mark` (with a `fix` that deletes the repeated one) and is stored once.
 */
function attributesOf(blocks: readonly Attrs[], loose: readonly Attribute[], file: string, issues: Issue[]): Atributo[] {
  return [...blocks.flatMap((block) => block.items), ...loose].map((item) => {
    const keyList = [...new Set(item.keys)] as AttributeKey[];
    item.keys.forEach((key, i) => {
      if (item.keys.indexOf(key) === i) return;
      const { start, end } = rangeOfIndex(item, 'keys', i);
      const previous = rangeOfIndex(item, 'keys', i - 1);
      issues.push({
        code: CODES.E_DUPLICATE_KEY_MARK,
        severity: 'error',
        file: file,
        ...start,
        message: `Key mark '${key}' repeated in Attribute '${item.name}'`,
        // The repeated one is deleted together with the space separating it from the previous mark.
        fix: { file, range: { start: previous.start.line === start.line ? previous.end : start, end }, replacement: '' },
      });
    });
    return {
      name: item.name,
      type: item.type,
      notes: item.notes ?? '',
      ...(keyList.length > 0 && { keys: keyList }),
      ...(item.optional && { optional: true }),
      ...(item.planned && { planned: true }),
    };
  });
}

/** Source kinds the tools read (`path`: scan and coverage; `spec`: `inspect planned`) or document. */
const FONT_TYPES = ['path', 'spec', 'file', 'url', 'git'] as const;

/** The refs stay opaque; an unknown kind (`kind "spec"`, a typo) is the warning `unknown-source-kind`. */
function referencesOf(blocks: readonly Source[], file: string, issues: Issue[]): OpaqueReference[] {
  return blocks.flatMap((block) =>
    block.items.map((item) => {
      if (!(FONT_TYPES as readonly string[]).includes(item.kind)) {
        const issue = issueWithSuggestion(
          {
            code: CODES.W_UNKNOWN_SOURCE_KIND,
            message: `Source kind '${item.kind}' is not known (${FONT_TYPES.join(', ')}); write '<kind> "<ref>"', e.g. 'spec "prd.md#2"'`,
          },
          file,
          item,
          'kind',
          FONT_TYPES,
        );
        // Never a fix: in the mistaken form `kind "spec" ref "..."` a close kind would still be wrong.
        const { fix, ...withoutFix } = issue;
        issues.push({ ...withoutFix, severity: 'warning', ...(fix !== undefined && { hint: `did you mean '${fix.replacement}'` }) });
      }
      return { kind: item.kind, ref: item.ref };
    }),
  );
}

/**
 * Edges are compiled as they are; whether their ends exist is checked by
 * `validate` in `canonical` (with the position the Locator provides).
 */
function compileEdge(edge: Edge): Arista {
  const endpoint = ({ node, attribute }: Edge['from']): Endpoint => ({
    node,
    ...(attribute !== undefined && { attribute }),
  });
  return {
    from: endpoint(edge.from),
    to: endpoint(edge.to),
    ...(edge.fromCardinality !== undefined && { fromCardinality: edge.fromCardinality }),
    ...(edge.toCardinality !== undefined && { toCardinality: edge.toCardinality }),
    ...(edge.label !== undefined && { label: edge.label }),
    ...(edge.identifying && { identifying: true }),
    ...(edge.planned && { planned: true }),
  };
}

/** Interaction as it is; `validate` checks that each Message's ends exist and that ids do not repeat. */
function compileInteraction(interaction: Interaction): Interaccion {
  return {
    id: interaction.name,
    title: interaction.title ?? interaction.name,
    description: interaction.description ?? '',
    items: interaction.items.map(compileItem),
    ...(interaction.planned && { planned: true }),
  };
}

function compileItem(item: InteractionItem): ItemDeInteraccion {
  if (item.$type === 'Fragment') {
    return {
      type: 'fragment',
      operator: item.operator,
      operands: item.operands.map((operand) => ({
        ...(operand.guard !== undefined && { guard: operand.guard }),
        ...(operand.$type === 'NextOperand' && { separator: operand.separator }),
        items: operand.items.map(compileItem),
      })),
    };
  }
  if (item.$type === 'Note') return { type: 'note', anchor: item.anchor, targets: [...item.targets], text: item.text };
  if (item.$type === 'InteractionRef') return { type: 'ref', interaction: item.interaction };
  return {
    type: 'message',
    ...(item.alias !== undefined && { id: item.alias }),
    kind: item.kind ?? 'sync',
    from: item.from,
    to: item.to,
    ...(item.label !== undefined && { label: item.label }),
    ...(item.description !== undefined && { description: item.description }),
  };
}

function syntaxIssuesOf(
  file: string,
  text: string,
  result: ParseResult<DiagramFile>,
): Issue[] {
  const syntax = (message: string, line: number, column: number): Issue => ({
    code: CODES.E_SYNTAX_ERROR,
    severity: 'error',
    file: file,
    line,
    column,
    message,
  });
  return [
    ...result.lexerErrors.map((error) => syntax(error.message, error.line ?? 1, error.column ?? 1)),
    ...result.parserErrors.map((error) => {
      const { startLine, startColumn } = error.token;
      // At EOF Langium gives NaN or -1 as position: the end of the text is used.
      return startLine !== undefined && startColumn !== undefined && startLine >= 1 && startColumn >= 1
        ? syntax(error.message, startLine, startColumn)
        : syntax(error.message, ...textEnd(text));
    }),
  ];
}

/** 1-based position just after the last character (errors at EOF). */
function textEnd(text: string): [number, number] {
  const lines = text.split(/\r\n|\r|\n/);
  return [lines.length, (lines[lines.length - 1] as string).length + 1];
}

function compareIssues(a: Issue, b: Issue): number {
  return (
    a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code)
  );
}
