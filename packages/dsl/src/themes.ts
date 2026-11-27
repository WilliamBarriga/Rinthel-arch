/**
 * Flattens `extends` into flat Themes and validates each block against the `theme` catalog. `theme` and
 * `part` names are unique in the Workspace; unknown parents and cycles are errors. The neutral Theme always exists.
 *
 * Inheritance: palette, fonts and tokens merge by key (the child wins). In `node`/`group` a Layer with the
 * name of an inherited one changes it, a new one requires `before`/`after` and `layer x none` removes it; the
 * Node kind and state patches accumulate after the parent's; `slots` replaces the inherited layout. A Theme without
 * a base defines its stack in order. Without `extends`, it starts from the neutral fonts, tokens and Slots with an empty palette.
 */
import { CODES, OLD_CATALOG_VALUES, renameIssue, oldValueMessage, oldRename } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import type { AstNode as Ast } from 'langium';
import { STATES, HIGH_CONTRAST_THEME, NEUTRAL_THEME, applyOps, fontsWithoutFallback, opTouchesMetrics, parseState } from 'theme';
import type { SlotLayoutBox, ResolvedLayer, ThemeElement, LayerOp, ResolvedTheme } from 'theme';

import type { GroupItem, GroupPadding, NodeItem, Theme, ThemeDiagram, ThemeLayer, ThemeSlots, ThemeState, ThemeUse } from './generated/ast';
import { BUILT_IN_FILE, BUILT_IN_NAMES } from './built-in-themes';
import { toRange, stateErrorBase, issueWithSuggestion, rangeOf } from './positions';
import { compileEdge } from './themes-edge';
import { compileRow } from './themes-row';
import { compileSequence } from './themes-sequence';
import { compileSlots } from './themes-slots';
import type { SlotsTarget } from './themes-slots';
import { compileNodeAnimation } from './themes-animation';
import { compileBlock } from './themes-layers';
import { diagramName } from './themes-common';
import { compilePage } from './themes-page';
import type { BlockContext, Site } from './themes-layers';
import type { DeclaredPart } from './themes-common';

export interface DeclaredTheme {
  file: string;
  ast: Theme;
  /** Ranges of `name` and `parent`, to locate the issues. */
  name: TextRange;
  parent: TextRange;
}

export type PartDeclaration = DeclaredPart;

/** Where each Layer of a Theme was set, per cascade level; used by `inspect theme`. */
export interface ThemeOrigin {
  site: Site;
  /** Ancestors through `extends`, from the parent to the root. */
  extends: string[];
  /** Parts (`part`) used by the Theme and its ancestors. */
  parts: string[];
  /** Last patch that set each Layer, per stack (base, Node kind, state). */
  base: Record<string, Site>;
  kinds: Record<string, Record<string, Site>>;
  states: Record<string, Record<string, Site>>;
  /** The same for the `group` block; `collapsed` is the one of `state collapsed`. */
  group: { base: Record<string, Site>; kinds: Record<string, Record<string, Site>>; states: Record<string, Record<string, Site>>; collapsed: Record<string, Site> };
  /** Last patch that set each Layer of the page background. */
  page: Record<string, Site>;
  /** Last site of each Slot layout; the one neither the Theme nor its ancestors write is missing. */
  slots: Partial<Record<'nodo' | 'grupo' | 'colapsado', Site>>;
}

export interface CompiledThemes {
  themes: ResolvedTheme[];
  issues: Issue[];
  /** Includes the built-in ones (file `<incorporados>`); `high-contrast` is not listed. */
  origins: Record<string, ThemeOrigin>;
  /** Layer patches of a View (`theme t { layer ... }`) validated against the Theme `theme`. */
  parchesDeVista(theme: string, items: ReadonlyArray<ThemeLayer | ThemeUse>, file: string): { ops: LayerOp[]; issues: Issue[] };
}

interface CompiledTheme {
  theme: ResolvedTheme;
  /** Site of each Layer of the Node's base stack, for `related`. */
  origins: Map<string, Site>;
  origin: ThemeOrigin;
}

type SiteRegistry = Record<string, Map<string, Site>>;

interface Environment {
  parts: ReadonlyMap<string, DeclaredPart>;
  kinds: readonly string[];
  issues: Issue[];
  /** Origin of the Layers set by Node kind and state patches. */
  byKind: SiteRegistry;
  byState: SiteRegistry;
  /** Origin of the Layers of the Group's `collapsed` patch (under the key `collapsed`). */
  byCollapse: SiteRegistry;
  slotSites: Map<'nodo' | 'grupo' | 'colapsado', Site>;
}

/** Names of the `part`s a block uses, including the ones those parts use. */
/** The `extends` of a Theme points to an undeclared one; an old built-in Theme name is `old-catalog-value` if the new one exists. */
function undeclaredParentTheme(parent: string, file: string, ast: Theme, existing: readonly string[]): Issue {
  const newName = oldRename(OLD_CATALOG_VALUES, 'theme', parent);
  if (newName !== undefined && existing.includes(newName)) return renameIssue(CODES.E_OLD_CATALOG_VALUE, oldValueMessage('theme', parent, newName), file, rangeOf(ast, 'parent'), newName);
  return issueWithSuggestion({ code: CODES.E_UNKNOWN_THEME, message: `Theme '${parent}' is not declared` }, file, ast, 'parent', existing);
}

function usedParts(items: ReadonlyArray<{ $type: string }>, parts: ReadonlyMap<string, DeclaredPart>, viewList = new Set<string>()): string[] {
  for (const item of items) {
    if (item.$type === 'ThemeUse') {
      const { name } = item as ThemeUse;
      if (viewList.has(name)) continue;
      viewList.add(name);
      const part = parts.get(name);
      if (part !== undefined) usedParts(part.ast.items, parts, viewList);
    } else if ('items' in item && Array.isArray(item.items)) usedParts(item.items as ReadonlyArray<{ $type: string }>, parts, viewList);
  }
  return [...viewList];
}

const copySite = (map: ReadonlyMap<string, Site>): Record<string, Site> => Object.fromEntries(map);
const copyRegistry = (registry: Record<string, Record<string, Site>>): SiteRegistry =>
  Object.fromEntries(Object.entries(registry).map(([key, sites]) => [key, new Map(Object.entries(sites))]));

const copyLayer = <C extends { primitiva: { props: Record<string, string | number> } }>(c: C): C => ({ ...c, primitiva: { ...c.primitiva, props: { ...c.primitiva.props } } });

/**
 * Resolved Themes (the neutral one first) and issues. Themes with a cycle or an unknown parent are not resolved.
 * `kinds` are the Node kinds declared in `specification`.
 */
export function resolveThemes(declaredList: readonly DeclaredTheme[], declaredParts: readonly PartDeclaration[], kinds: readonly string[]): CompiledThemes {
  const issues: Issue[] = [];
  const byName = new Map<string, DeclaredTheme>();
  for (const declared of declaredList) {
    const { name } = declared.ast;
    const original = byName.get(name);
    if (original !== undefined || name === HIGH_CONTRAST_THEME.name) {
      issues.push({
        code: CODES.E_DUPLICATE_THEME,
        severity: 'error',
        file: declared.file,
        ...declared.name.start,
        message: `Duplicate Theme '${name}'`,
        ...(original !== undefined && original.file !== BUILT_IN_FILE && {
          related: [{ file: original.file, ...original.name.start, message: `First declaration of '${name}'` }],
        }),
      });
      continue;
    }
    byName.set(name, declared);
  }

  const parts = new Map<string, DeclaredPart>();
  for (const part of declaredParts) {
    const original = parts.get(part.ast.name);
    if (original === undefined) {
      parts.set(part.ast.name, part);
      continue;
    }
    issues.push({
      code: CODES.E_DUPLICATE_PART,
      severity: 'error',
      file: part.file,
      ...part.name.start,
      message: `Parte duplicada '${part.ast.name}'`,
      related: [{ file: original.file, ...original.name.start, message: `First declaration of '${part.ast.name}'` }],
    });
  }

  const builtIn: ThemeOrigin = { site: { file: '(incorporado)', line: 1, column: 1 }, extends: [], parts: [], base: {}, kinds: {}, states: {}, group: { base: {}, kinds: {}, states: {}, collapsed: {} }, page: {}, slots: {} };
  const resolved = new Map<string, CompiledTheme>();
  const highContrast: CompiledTheme = { theme: HIGH_CONTRAST_THEME, origins: new Map(), origin: builtIn };
  const inProgress = new Set<string>();
  const failed = new Set<string>();
  const resolve = (declared: DeclaredTheme): CompiledTheme | undefined => {
    const { name, parent } = declared.ast;
    const isDone = resolved.get(name);
    if (isDone !== undefined) return isDone;
    if (inProgress.has(name) || failed.has(name)) return undefined;
    inProgress.add(name);

    let base: CompiledTheme | undefined;
    if (parent !== undefined) {
      const parentTheme = byName.get(parent);
      base = parent === HIGH_CONTRAST_THEME.name ? highContrast : parentTheme && resolve(parentTheme);
      if (base === undefined) {
        issues.push(
          parentTheme !== undefined
            ? { code: CODES.E_EXTENDS_CYCLE, severity: 'error', file: declared.file, ...declared.parent.start, message: `extends cycle: '${name}' extends '${parent}', which depends on it` }
            : undeclaredParentTheme(parent, declared.file, declared.ast, [...byName.keys(), HIGH_CONTRAST_THEME.name]),
        );
        inProgress.delete(name);
        failed.add(name);
        return undefined;
      }
    }

    const origin = base?.theme ?? NEUTRAL_THEME;
    const theme: ResolvedTheme = {
      name,
      palette: { ...(base?.theme.palette ?? {}) },
      fonts: { ...origin.fonts },
      tokens: { ...origin.tokens },
      nodo: {
        capas: origin.nodo.capas.map(copyLayer),
        slots: structuredClone(origin.nodo.slots),
        textos: { ...origin.nodo.textos },
        tipos: Object.fromEntries(Object.entries(origin.nodo.tipos).map(([kind, ops]) => [kind, [...ops]])),
        estados: Object.fromEntries(Object.entries(origin.nodo.estados).map(([state, ops]) => [state, [...ops]])),
        ...(origin.nodo.diagramas !== undefined && { diagramas: structuredClone(origin.nodo.diagramas) }),
        ...(origin.nodo.animacion !== undefined && { animacion: structuredClone(origin.nodo.animacion) }),
      },
      grupo: {
        capas: origin.grupo.capas.map(copyLayer),
        slots: structuredClone(origin.grupo.slots),
        textos: { ...origin.grupo.textos },
        padding: { ...origin.grupo.padding },
        tipos: Object.fromEntries(Object.entries(origin.grupo.tipos).map(([kind, ops]) => [kind, [...ops]])),
        estados: Object.fromEntries(Object.entries(origin.grupo.estados).map(([state, ops]) => [state, [...ops]])),
        colapsado: structuredClone(origin.grupo.colapsado),
        ...(origin.grupo.diagramas !== undefined && { diagramas: structuredClone(origin.grupo.diagramas) }),
        ...(origin.grupo.animacion !== undefined && { animacion: structuredClone(origin.grupo.animacion) }),
      },
      arista: {
        capas: origin.arista.capas.map(copyLayer),
        ...(origin.arista.diagramas !== undefined && { diagramas: structuredClone(origin.arista.diagramas) }),
        ...(origin.arista.identificante !== undefined && { identificante: structuredClone(origin.arista.identificante) }),
        ...(origin.arista.origen !== undefined && { origen: { ...origin.arista.origen, props: { ...origin.arista.origen.props } } }),
        ...(origin.arista.fin !== undefined && { fin: { ...origin.arista.fin, props: { ...origin.arista.fin.props } } }),
        ...(origin.arista.etiqueta !== undefined && { etiqueta: { ...origin.arista.etiqueta, props: { ...origin.arista.etiqueta.props } } }),
      },
      pagina: { capas: origin.pagina.capas.map(copyLayer), fijo: origin.pagina.fijo },
      ...(origin.fila !== undefined && { fila: structuredClone(origin.fila) }),
      ...(origin.secuencia !== undefined && { secuencia: structuredClone(origin.secuencia) }),
    };
    const origins = new Map(base?.origins);
    const byKind = copyRegistry(base?.origin.kinds ?? {});
    const byState = copyRegistry(base?.origin.states ?? {});
    const groupOrigins = new Map(Object.entries(base?.origin.group.base ?? {}));
    const groupByKind = copyRegistry(base?.origin.group.kinds ?? {});
    const groupByState = copyRegistry(base?.origin.group.states ?? {});
    const slotSites = new Map(Object.entries(base?.origin.slots ?? {}) as Array<['nodo' | 'grupo' | 'colapsado', Site]>);
    const groupByCollapse = copyRegistry({ collapsed: base?.origin.group.collapsed ?? {} });
    for (const part of declared.ast.parts) {
      if (part.$type === 'ThemeNode' || part.$type === 'ThemeGroup' || part.$type === 'ThemeEdge' || part.$type === 'ThemePage' || part.$type === 'ThemeRow' || part.$type === 'ThemeSequence') continue;
      const target = part.$type === 'ThemePalette' ? theme.palette : part.$type === 'ThemeFonts' ? theme.fonts : theme.tokens;
      for (const { key, value } of part.entries) target[key] = value;
    }
    // A non-generic family asks for an explicit fallback; it is checked against the already inherited `fonts`.
    const withoutReserve = fontsWithoutFallback(theme.fonts);
    for (const part of declared.ast.parts) {
      if (part.$type !== 'ThemeFonts') continue;
      for (const entry of part.entries.filter((e) => withoutReserve.includes(e.key))) {
        issues.push({
          code: CODES.E_THEME_FONT_NO_FALLBACK,
          severity: 'error',
          file: declared.file,
          ...toRange(entry.$cstNode?.range).start,
          message: `Family '${entry.value}' of fonts.${entry.key} declares no fallback`,
          hint: 'Add fallback "sans-serif" (or the matching generic family) to the fonts block',
        });
      }
    }
    // The `node` block is compiled last: its colors and tokens are validated against the complete Palette and tokens.
    const items = declared.ast.parts.flatMap((part) => (part.$type === 'ThemeNode' ? part.items : []));
    compileElement('nodo', declared.file, items, theme, origins, { parts, kinds, issues, byKind, byState, byCollapse: {}, slotSites });
    const ofGroup = declared.ast.parts.flatMap((part) => (part.$type === 'ThemeGroup' ? part.items : []));
    compileElement('grupo', declared.file, ofGroup, theme, groupOrigins, { parts, kinds, issues, byKind: groupByKind, byState: groupByState, byCollapse: groupByCollapse, slotSites });
    const edgeBorder = declared.ast.parts.flatMap((part) => (part.$type === 'ThemeEdge' ? part.items : []));
    compileEdge(edgeBorder, theme, { file: declared.file, parts, palette: theme.palette, tokens: theme.tokens, issues });
    const ofRow = declared.ast.parts.flatMap((part) => (part.$type === 'ThemeRow' ? part.items : []));
    compileRow(ofRow, theme, { file: declared.file, parts, palette: theme.palette, tokens: theme.tokens, issues });
    const ofSequence = declared.ast.parts.flatMap((part) => (part.$type === 'ThemeSequence' ? [part] : []));
    compileSequence(ofSequence, theme, { file: declared.file, parts, palette: theme.palette, tokens: theme.tokens, issues });
    const ofPage = declared.ast.parts.flatMap((part) => (part.$type === 'ThemePage' ? part.items : []));
    const pageOrigins = new Map(Object.entries(base?.origin.page ?? {}));
    compilePage(ofPage, theme, { file: declared.file, parts, palette: theme.palette, tokens: theme.tokens, issues, origins: pageOrigins });
    inProgress.delete(name);
    const fromParent = base === undefined ? [] : [parent as string, ...base.origin.extends];
    const compiled: CompiledTheme = {
      theme: theme,
      origins: origins,
      origin: {
        site: { file: declared.file, ...declared.name.start },
        extends: fromParent,
        parts: [...new Set([...(base?.origin.parts ?? []), ...usedParts([...items, ...ofGroup, ...edgeBorder, ...ofRow, ...ofSequence.flatMap((b) => b.items), ...ofPage], parts)])],
        base: copySite(origins),
        kinds: Object.fromEntries(Object.entries(byKind).map(([key, map]) => [key, copySite(map)])),
        states: Object.fromEntries(Object.entries(byState).map(([key, map]) => [key, copySite(map)])),
        group: {
          base: copySite(groupOrigins),
          kinds: Object.fromEntries(Object.entries(groupByKind).map(([key, map]) => [key, copySite(map)])),
          states: Object.fromEntries(Object.entries(groupByState).map(([key, map]) => [key, copySite(map)])),
          collapsed: copySite(groupByCollapse['collapsed'] ?? new Map()),
        },
        page: copySite(pageOrigins),
        slots: Object.fromEntries(slotSites),
      },
    };
    resolved.set(name, compiled);
    return compiled;
  };
  for (const declared of byName.values()) resolve(declared);

  return {
    // The built-in ones first and in their order; `high-contrast` is defined by `theme`.
    themes: [...resolved.values(), highContrast]
      .map(({ theme }) => theme)
      .sort((a, b) => (BUILT_IN_NAMES.indexOf(a.name as never) + 1 || 99) - (BUILT_IN_NAMES.indexOf(b.name as never) + 1 || 99)),
    issues,
    origins: Object.fromEntries([...resolved].map(([name, { origin }]) => [name, origin])),
    parchesDeVista: (themeName, items, file) => {
      const ofTheme = resolved.get(themeName);
      const ofViewBlock: Issue[] = [];
      if (ofTheme === undefined) return { ops: [], issues: ofViewBlock };
      const ops = compileBlock(items, {
        file: file,
        parts: parts,
        palette: ofTheme.theme.palette,
        tokens: ofTheme.theme.tokens,
        mode: 'parchear',
        candidates: allStacks(ofTheme.theme),
        origins: new Map(ofTheme.origins),
        issues: ofViewBlock,
      });
      return { ops, issues: ofViewBlock };
    },
  };
}

/** All the Node's stacks (base, per Node kind, per state) a View patch is validated against. */
function allStacks(theme: ResolvedTheme): ResolvedLayer[][] {
  const base = theme.nodo.capas as ResolvedLayer[];
  const overKinds = stacksOverKinds(theme, base, 'nodo');
  const byState = Object.values(theme.nodo.estados).flatMap((ops) => overKinds.map((stack) => applyOps(stack, ops, theme.palette, 'parchear').pila));
  return [...overKinds, ...byState];
}

/** The closed Group. It is not a `theme` State (it is not about interaction): only the Group accepts it. */
const COLLAPSED_STATE = 'collapsed';

const STATES_OF: Record<ThemeElement, readonly string[]> = { nodo: STATES, grupo: [...STATES, COLLAPSED_STATE] };

/** Stacks a Node kind patch is validated against: the base one and the one of each Diagram type. */
function stacksOverDiagrams(theme: ResolvedTheme, base: ResolvedLayer[], element: ThemeElement): ResolvedLayer[][] {
  return [base, ...Object.values(theme[element].diagramas ?? {}).map(({ ops }) => applyOps(base, ops, theme.palette, 'parchear').pila)];
}

/** The stacks of `stacksOverDiagrams` and, over each one, the one of each Node kind with patches. */
function stacksOverKinds(theme: ResolvedTheme, base: ResolvedLayer[], element: ThemeElement): ResolvedLayer[][] {
  const bases = stacksOverDiagrams(theme, base, element);
  return [...bases, ...Object.values(theme[element].tipos).flatMap((ops) => bases.map((stack) => applyOps(stack, ops, theme.palette, 'parchear').pila))];
}

/** 1, 2 or 4 values, as in CSS. */
function compilePadding(item: GroupPadding, file: string, issues: Issue[]): ResolvedTheme['grupo']['padding'] | undefined {
  const v = item.values.map(Number);
  const [a, b, c, d] = v as [number, number, number, number];
  const sides = v.length === 1 ? { top: a, right: a, bottom: a, left: a } : v.length === 2 ? { top: a, right: b, bottom: a, left: b } : v.length === 4 ? { top: a, right: b, bottom: c, left: d } : undefined;
  const outside = v.find((n) => n < 0 || n > 128);
  if (sides === undefined || outside !== undefined) {
    issues.push({
      code: CODES.E_THEME_INVALID_VALUE,
      severity: 'error',
      file: file,
      ...toRange(item.$cstNode?.range).start,
      message: sides === undefined ? `'padding' takes 1, 2 or 4 values (top, right, bottom, left), not ${v.length}` : `'padding' ${outside} is out of range; use 0 to 128`,
    });
    return undefined;
  }
  return { top: sides.top, left: sides.left, bottom: sides.bottom, right: sides.right };
}

/**
 * Compiles `node` or `group` over the inherited stack in order: base, Diagram types, Node kinds, states.
 * The Group does not accept Node kind patches that touch the Metrics.
 */
function compileElement(element: ThemeElement, file: string, items: ReadonlyArray<GroupItem>, theme: ResolvedTheme, origins: Map<string, Site>, env: Environment): void {
  const { parts, kinds, issues } = env;
  const context = { file, parts, palette: theme.palette, tokens: theme.tokens, origins, issues };
  const block = theme[element];
  const collapsible = STATES_OF[element].includes(COLLAPSED_STATE);
  const ofNodeBlock = items.filter((item): item is NodeItem => item.$type !== 'GroupPadding');

  const fromBase = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const mode = block.capas.length === 0 ? 'definir' : 'parchear';
  const baseOps = compileBlock(fromBase, { ...context, mode, candidates: [block.capas as ResolvedLayer[]] });
  block.capas = applyOps(block.capas as ResolvedLayer[], baseOps, theme.palette, mode).pila;
  for (const item of items) {
    if (item.$type === 'ThemeSlots') {
      env.slotSites.set(element, { file, ...toRange(item.$cstNode?.range).start });
      compileSlots(item, block, { file, parts, palette: theme.palette, tokens: theme.tokens, issues }, element);
    } else if (item.$type === 'GroupPadding' && element === 'grupo') theme.grupo.padding = compilePadding(item, file, issues) ?? theme.grupo.padding;
  }

  const animation = compileNodeAnimation(ofNodeBlock, block.animacion, file, issues);
  if (animation !== undefined) block.animacion = animation;

  // Patches per Diagram type can change the Metrics.
  const base = block.capas as ResolvedLayer[];
  for (const item of ofNodeBlock) {
    if (item.$type === 'ThemeDiagram') compileDiagram(item, element, theme, { ...context, env });
  }
  const overDiagrams = stacksOverDiagrams(theme, base, element);

  for (const item of ofNodeBlock) {
    if (item.$type !== 'ThemeType') continue;
    if (!kinds.includes(item.name)) {
      issues.push(
        issueWithSuggestion(
          { code: CODES.E_UNKNOWN_NODE_TYPE, message: `Node kind '${item.name}' is not declared in 'specification'` },
          file, item, 'name', kinds,
        ),
      );
      continue;
    }
    const ownList = new Map(origins);
    const ops = compileBlock(item.items, { ...context, origins: ownList, mode: 'parchear', candidates: overDiagrams });
    if (element === 'grupo') warnIfMetricsTouched(ops, overDiagrams, item, `A Group kind patch cannot touch Metrics`, `'${item.name}' has no entry of its own in the table; use the base block or 'state collapsed'`, file, issues);
    block.tipos[item.name] = [...(block.tipos[item.name] ?? []), ...ops];
    recordOrigins(env.byKind, item.name, ownList, origins);
  }

  const overKinds = stacksOverKinds(theme, base, element);
  const withCollapse = collapsible ? [...overKinds, ...overKinds.map((stack) => applyOps(stack, theme.grupo.colapsado.ops, theme.palette, 'parchear').pila)] : overKinds;
  for (const item of ofNodeBlock) {
    if (item.$type !== 'ThemeState') continue;
    if (collapsible && item.name === COLLAPSED_STATE) {
      compileCollapsed(item, theme, { ...context, env, overKinds });
      continue;
    }
    const parsed = parseState(item.name);
    if ('error' in parsed) {
      issues.push(issueWithSuggestion(stateErrorBase(parsed.error), file, item, 'name', STATES_OF[element]));
      continue;
    }
    const { estado: state } = parsed;
    for (const slots of item.items.filter((i): i is ThemeSlots => i.$type === 'ThemeSlots')) {
      issues.push({
        code: CODES.E_THEME_STATE_TOUCHES_METRICS,
        severity: 'error',
        file: file,
        ...toRange(slots.$cstNode?.range).start,
        message: `A state patch cannot touch Slots: '${state}' never re-lays out; change them in the base block`,
      });
    }
    const layers = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
    const ownList = new Map([...origins, ...[...Object.values(env.byKind)].flatMap((map) => [...map]), ...[...Object.values(env.byCollapse)].flatMap((map) => [...map])]);
    const initial = new Map(ownList);
    const ops = compileBlock(layers, { ...context, origins: ownList, mode: 'parchear', candidates: withCollapse });
    recordOrigins(env.byState, state, ownList, initial);
    warnIfMetricsTouched(ops, withCollapse, item, `A state patch cannot touch Metrics`, `'${state}' never re-lays out; change it in the base block`, file, issues);
    block.estados[state] = [...(block.estados[state] ?? []), ...ops];
  }
}

/**
 * An unknown type is `theme-unknown-diagram-type` with a typo `fix`. Several blocks of the same type
 * accumulate. `padding` is only valid on the Group; a Slot's text styles do not change per Diagram type.
 */
function compileDiagram(item: ThemeDiagram, element: ThemeElement, theme: ResolvedTheme, ctx: Omit<BlockContext, 'mode' | 'candidates'> & { env: Environment }): void {
  const { file, parts, issues } = ctx;
  const diagram = diagramName(item, file, issues);
  if (diagram === undefined) return;
  const block = theme[element];
  const base = block.capas as ResolvedLayer[];
  const previous = block.diagramas?.[diagram];
  const current = previous === undefined ? base : applyOps(base, previous.ops, theme.palette, 'parchear').pila;
  const layers = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
  const ownList = new Map(ctx.origins);
  const ops = compileBlock(layers, { ...ctx, origins: ownList, mode: 'parchear', candidates: [current] });
  const patch: { ops: LayerOp[]; slots?: SlotLayoutBox; padding?: ResolvedTheme['grupo']['padding'] } = { ops: [...(previous?.ops ?? []), ...ops], ...(previous?.slots !== undefined && { slots: previous.slots }) };
  if (previous !== undefined && 'padding' in previous && previous.padding !== undefined) patch.padding = previous.padding;
  for (const child of item.items) {
    if (child.$type === 'ThemeSlots') {
      const target: SlotsTarget = {};
      compileSlots(child, target, { file, parts, palette: theme.palette, tokens: theme.tokens, issues }, element);
      if (target.slots !== undefined) patch.slots = target.slots;
    } else if (child.$type === 'GroupPadding') {
      if (element === 'grupo') patch.padding = compilePadding(child, file, issues) ?? patch.padding;
      else issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file, ...toRange(child.$cstNode?.range).start, message: "'padding' belongs to the Group: put it in 'group { diagram ... }'" });
    } else if (child.$type === 'ThemeMarker' || child.$type === 'ThemeLabel') {
      issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file, ...toRange(child.$cstNode?.range).start, message: `'${child.$type === 'ThemeLabel' ? 'label' : child.side}' belongs to the Edge: put it in 'edge { diagram ... }'` });
    }
  }
  block.diagramas = {
    ...block.diagramas,
    [diagram]: element === 'grupo' ? patch : { ops: patch.ops, ...(patch.slots !== undefined && { slots: patch.slots }) },
  };
}

/** Error `theme-state-touches-metrics` for each patch that changes the box (`opTouchesMetrics`). */
function warnIfMetricsTouched(ops: readonly LayerOp[], stacks: ReadonlyArray<readonly ResolvedLayer[]>, where: Ast, title: string, advice: string, file: string, issues: Issue[]): void {
  for (const op of ops) {
    const reason = opTouchesMetrics(op, stacks);
    if (reason === undefined) continue;
    issues.push({ code: CODES.E_THEME_STATE_TOUCHES_METRICS, severity: 'error', file, ...toRange(where.$cstNode?.range).start, message: `${title}: ${reason}; ${advice}` });
  }
}

/** The closed Group behaves like a leaf Node: it can change the box, and its `slots` replaces the header. */
function compileCollapsed(item: ThemeState, theme: ResolvedTheme, ctx: Omit<BlockContext, 'mode' | 'candidates'> & { env: Environment; overKinds: ResolvedLayer[][] }): void {
  const { file, parts, issues, env } = ctx;
  const collapsedBlock = theme.grupo.colapsado;
  for (const slots of item.items.filter((i): i is ThemeSlots => i.$type === 'ThemeSlots')) {
    env.slotSites.set('colapsado', { file, ...toRange(slots.$cstNode?.range).start });
    compileSlots(slots, collapsedBlock, { file, parts, palette: theme.palette, tokens: theme.tokens, issues }, 'grupo');
  }
  const layers = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
  const ownList = new Map(ctx.origins);
  const ops = compileBlock(layers, { ...ctx, origins: ownList, mode: 'parchear', candidates: ctx.overKinds });
  recordOrigins(env.byCollapse, COLLAPSED_STATE, ownList, ctx.origins);
  collapsedBlock.ops = [...collapsedBlock.ops, ...ops];
}

/** Stores in `registry[key]` the Layers the block set: those `ownList` has different from `before`. */
function recordOrigins(registry: SiteRegistry, key: string, ownList: ReadonlyMap<string, Site>, before: ReadonlyMap<string, Site>): void {
  const target = registry[key] ?? new Map<string, Site>();
  for (const [name, site] of ownList) if (before.get(name) !== site) target.set(name, site);
  registry[key] = target;
}
