import { CODES, nearestCandidates, resolveView } from 'canonical';
import type { CanonicalForm, Geometry, CachedGeometry, GraphGeometry, Issue, Theme, Locator, View } from 'canonical';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace, OrigenDeTema, PosicionDePin, ResultadoDeCompilacion } from 'dsl';
import { layoutKey, layoutView } from 'layout';
import { NEUTRAL_THEME, contrastWarnings, identifyingEdgeColorOnly, resolvedStyle, colorOnlyMessages, readOps, resolveFonts, resolveTheme, colorOnlyKinds, codeUses } from 'theme';
import type { ResolvedStyle, ComponentUse } from 'theme';

import { queryTheme } from './theme-query';
import { runQuery } from './queries';
import type { Query, QueryAnswer } from './queries';

/** Derived files, by path relative to `<workspace>/.diagrams/`. */
export type BuildOutput = Record<string, string>;

/** Interface of a Theme component according to the adapter. */
export interface ComponentInterface {
  /** Type of each parameter; without it, the parameters are not checked. */
  params?: Readonly<Record<string, 'numero' | 'texto'>>;
}

export interface SessionOptions {
  /** Global Theme; a View with its own `theme` overrides it. */
  theme?: string;
  /**
   * Theme components by name. With the registry, `diagnose` and `build` check that they exist and that their
   * parameters match; without it they only emit `theme-with-code` per Theme (or View) that uses the `code` Layer.
   */
  components?: Readonly<Record<string, ComponentInterface>>;
  /**
   * Paths (relative to the Workspace, with `/`) of the font files. With them a file is required per `fonts` family
   * (`theme-font-missing`) and the Resolved style carries the faces; without them nothing is checked.
   */
  fontFiles?: readonly string[];
  /** Adapter issues (e.g. a `.tsx` that does not compile); added as they are to those of `diagnose` and `build`. */
  adapterIssues?: readonly Issue[];
}

export interface GeometryOptions {
  /** Another declared Theme to draw the View with (preview without writing). */
  theme?: string;
}

export interface BuildResult {
  /** `canonico.json` and `geometria/<view>.json`; empty if the Workspace has errors. */
  files: BuildOutput;
  /** Includes the issues only known after layout. */
  issues: Issue[];
}

/** Compiled state of a Workspace; immutable value. Each Session compiles the whole Workspace (no incremental compilation). */
export interface Session {
  /** Canonical form; absent if the compilation has errors. */
  readonly source: CanonicalForm | undefined;
  /** Locator of the Canonical form (file and range of each value); absent together with `source`. */
  readonly locate: Locator | undefined;
  /** Origin of the Layers of each Theme declared in the text (`extends` chain, `part`, site of each Layer); empty without a Canonical form. */
  readonly themeOrigins: Readonly<Record<string, OrigenDeTema>>;
  /**
   * Compilation, adapter, Theme and `overlapping-pins` issues. It only computes layout in Views with 2 or more Pins.
   * An internal layout failure rejects the promise.
   */
  diagnose(): Promise<Issue[]>;
  /** `build` files (geometry of every View) and all the issues. An internal layout failure rejects the promise. */
  build(): Promise<BuildResult>;
  /**
   * Cacheable geometry of a View, lazy and memoized per View; `undefined` if the View does not exist. With `theme`,
   * that of the View drawn with that declared Theme, not memoized (`undefined` if the Theme does not exist). An internal
   * layout failure rejects the promise.
   */
  geometry(view: string, options?: GeometryOptions): Promise<CachedGeometry | undefined>;
  /** Resolved style (Metrics and paint) of a View's Theme; `undefined` if the View does not exist. Synchronous: it needs no layout. */
  style(view: string): ResolvedStyle | undefined;
  /** Read-only query, synchronous and without layout; `undefined` if the Session has no Canonical form. */
  query(query: Query): QueryAnswer | undefined;
  /** Ids of the Views whose geometry was already requested (computed or in progress). */
  viewsWithGeometry(): string[];
  /**
   * Another Session for these files; the current one does not change. It reuses a View's geometry when its
   * `layoutKey`, its Theme and its Pins do not change. `changes` renews `components`, `adapterIssues` and `fontFiles`.
   */
  update(files: ArchivosDelWorkspace, changes?: Pick<SessionOptions, 'components' | 'adapterIssues' | 'fontFiles'>): Session;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function viewTheme(source: CanonicalForm, view: View, global: string | undefined): Theme {
  const name = view.theme ?? global ?? NEUTRAL_THEME.name;
  return source.themes.find((theme) => theme.name === name) ?? NEUTRAL_THEME;
}

/**
 * `overlapping-pins`: one warning per pair of overlapping Pins, located at the first one with the second in `related`.
 * A pair without a known text position (a Pin that does not come from the DSL) is not reported.
 */
function pinWarnings(view: string, geometry: Geometry, pins: readonly PosicionDePin[]): Issue[] {
  switch (geometry.kind) {
    case 'grafo':
      return graphPinWarnings(view, geometry, pins);
    case 'secuencia':
      return [];
  }
}

function graphPinWarnings(view: string, geometry: GraphGeometry, pins: readonly PosicionDePin[]): Issue[] {
  const pinOf = (node: string) => pins.find((pin) => pin.view === view && pin.node === node);
  return geometry.pinsSolapados.flatMap(([a, b]) => {
    const [first, second] = [pinOf(a), pinOf(b)];
    if (first === undefined || second === undefined) return [];
    return [
      {
        code: CODES.W_OVERLAPPING_PINS,
        severity: 'warning' as const,
        file: first.file,
        line: first.line,
        column: first.column,
        message: `In View '${view}', the Pins of '${a}' and '${b}' overlap`,
        related: [{ file: second.file, line: second.line, column: second.column, message: `Pin of '${b}'` }],
      },
    ];
  });
}

const kindColors = (source: CanonicalForm): Record<string, string | undefined> =>
  Object.fromEntries(source.specification.nodeTypes.map((kind) => [kind.name, typeof kind['color'] === 'string' ? kind['color'] : undefined]));

/**
 * Warnings only: `theme-low-contrast` per Theme, Node kind and state (at the Theme name) and `theme-color-only`
 * per View when two of its Node kinds differ only by color (at the View id).
 */
function accessibilityWarnings(source: CanonicalForm, locate: Locator | undefined, global: string | undefined): Issue[] {
  /** Position of the value at `path`; `null` if its file is not reliable (nothing is reported). */
  const site = (path: Parameters<Locator>[0]): { file: string; line: number; column: number } | null => {
    const location = locate === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : locate(path);
    return location === null ? null : { file: location.file, ...location.range.start };
  };
  const colors = kindColors(source);
  const issues: Issue[] = [];
  source.themes.forEach((theme, i) => {
    const location = site(['themes', i, 'name']);
    if (location === null) return;
    for (const warning of contrastWarnings(theme, colors)) {
      issues.push({ code: CODES.W_THEME_LOW_CONTRAST, severity: 'warning', ...location, message: `Theme '${theme.name}': ${warning.mensaje}`, hint: `adjust Layer '${warning.capa}' or the Palette colors` });
    }
  });
  source.views.forEach((declared, i) => {
    const resolved = resolveView(source, declared.id);
    const location = site(['views', i, 'id']);
    if (resolved === undefined || location === null) return;
    const used = new Set(resolved.nodes.map((n) => n.type));
    const kinds = source.specification.nodeTypes.filter((t) => used.has(t.name)).map((t) => ({ name: t.name, color: colors[t.name], icon: t.icon }));
    const theme = viewTheme(source, declared, global);
    const warning = (message: string): Issue => ({ code: CODES.W_THEME_COLOR_ONLY, severity: 'warning', ...location, message, hint: 'give the Theme a different stroke, marker or style; color alone is not enough' });
    const messageKinds = resolved.type === 'sequence' ? [...new Set(resolved.interaction.messages.map((m) => m.kind))] : [];
    for (const [a, b] of colorOnlyMessages(theme, messageKinds)) issues.push(warning(`In View '${declared.id}', Messages '${a}' and '${b}' differ only by color`));
    if (resolved.type === 'er' && resolved.edges.some((e) => e.identifying === true) && identifyingEdgeColorOnly(theme)) {
      issues.push(warning(`In View '${declared.id}', identifying and non-identifying Edges differ only by color`));
    }
    for (const [a, b] of colorOnlyKinds(theme, resolved.type, kinds)) {
      issues.push({
        code: CODES.W_THEME_COLOR_ONLY,
        severity: 'warning',
        ...location,
        message: `In View '${declared.id}', Node kinds '${a}' and '${b}' differ only by color`,
        hint: 'give the Theme a different shape, icon or border per kind; the viewer will show the legend',
      });
    }
  });
  return issues;
}

/**
 * `theme-with-code` per Theme (and per View whose override adds components) and, with `components`,
 * the check of their interface. It never runs nor reads code.
 */
function codeWarnings(source: CanonicalForm, locate: Locator | undefined, components: SessionOptions['components']): Issue[] {
  const site = (path: Parameters<Locator>[0]): { file: string; line: number; column: number } | null => {
    const location = locate === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : locate(path);
    return location === null ? null : { file: location.file, ...location.range.start };
  };
  const issues: Issue[] = [];
  const checkUses = (location: { file: string; line: number; column: number }, subject: string, uses: readonly ComponentUse[]): void => {
    if (uses.length === 0) return;
    const names = [...new Set(uses.map((use) => use.nombre))];
    issues.push({
      code: CODES.W_THEME_WITH_CODE,
      severity: 'warning',
      ...location,
      message: `${subject} uses code (components: ${names.join(', ')}); review it before trusting the Workspace`,
      hint: 'the `code` Layer runs Workspace code without a sandbox',
    });
    if (components === undefined) return;
    for (const use of uses) {
      const componentInterface = components[use.nombre];
      if (componentInterface === undefined) {
        const nearest = nearestCandidates(use.nombre, Object.keys(components));
        issues.push({ code: CODES.E_THEME_COMPONENT_MISSING, severity: 'error', ...location, message: `${subject}: component '${use.nombre}' does not exist in the Workspace`, ...(nearest.length > 0 && { hint: `did you mean ${nearest.map((c) => `'${c}'`).join(' or ')}` }) });
        continue;
      }
      if (componentInterface.params === undefined) continue;
      for (const [key, value] of Object.entries(use.parametros)) {
        const expected = componentInterface.params[key];
        const kind = typeof value === 'number' ? 'numero' : 'texto';
        const problem = expected === undefined ? `does not declare the parameter '${key}'` : expected === kind ? undefined : `expects '${key}' as ${expected}, not ${kind}`;
        if (problem !== undefined) issues.push({ code: CODES.E_THEME_COMPONENT_PARAMS, severity: 'error', ...location, message: `${subject}: component '${use.nombre}' ${problem}` });
      }
    }
  };
  source.themes.forEach((theme, i) => {
    const location = site(['themes', i, 'name']);
    if (location !== null) checkUses(location, `Theme '${theme.name}'`, codeUses(theme));
  });
  source.views.forEach((declared, i) => {
    if (declared.themePatch === undefined) return;
    const location = site(['views', i, 'id']);
    if (location === null) return;
    const theme = viewTheme(source, declared, undefined);
    const base = new Set(codeUses(theme).map((use) => JSON.stringify(use)));
    checkUses(location, `View '${declared.id}'`, codeUses(theme, readOps(declared.themePatch)).filter((use) => !base.has(JSON.stringify(use))));
  });
  return issues;
}

/** `theme-font-missing` per `fonts` family without a file, located at the Theme name; with the nearest family if any. */
function fontWarnings(source: CanonicalForm, locate: Locator | undefined, files: readonly string[] | undefined): Issue[] {
  if (files === undefined) return [];
  const available = [...new Set(files.flatMap((path) => /([^/]+?)(?:-[a-z]+(?:-ext)?-\d{3}-(?:normal|italic))?\.(?:woff2|woff|ttf|otf)$/i.exec(path)?.[1]?.toLowerCase() ?? []))];
  const issues: Issue[] = [];
  source.themes.forEach((theme, i) => {
    const location = locate === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : locate(['themes', i, 'name']);
    if (location === null) return;
    for (const { clave: key, familia: family } of resolveFonts(resolveTheme(theme).fonts, files).faltantes) {
      const nearest = nearestCandidates(family.toLowerCase().replace(/\s+/g, '-'), available);
      issues.push({
        code: CODES.E_THEME_FONT_MISSING,
        severity: 'error',
        file: location.file,
        ...location.range.start,
        message: `Theme '${theme.name}': font '${family}' (fonts.${key}) has no file in the Workspace`,
        hint: nearest.length > 0 ? `did you mean ${nearest.map((c) => `'${c}'`).join(' or ')}` : `copy ${family.toLowerCase().replace(/\s+/g, '-')}-latin-400-normal.woff2 into the Workspace, or use a generic family (sans-serif, monospace...)`,
      });
    }
  });
  return issues;
}

interface GeometryEntry {
  /** `layoutKey` plus the View's Pins: the only thing the geometry depends on. */
  key: string;
  result: Promise<CachedGeometry>;
}

type Memo = ReadonlyMap<string, GeometryEntry>;

function createSession(
  files: ArchivosDelWorkspace,
  options: SessionOptions,
  compiled: ResultadoDeCompilacion,
  previousMemo: Memo,
): Session {
  const { canonico: source, pins } = compiled;
  const memo = new Map<string, GeometryEntry>();
  const adapterIssues = options.adapterIssues ?? [];

  const keyOf = (view: string): { key: string; theme: Theme; resolved: NonNullable<ReturnType<typeof resolveView>> } | undefined => {
    if (source === undefined) return undefined;
    const declared = source.views.find(({ id }) => id === view);
    const resolved = resolveView(source, view);
    if (declared === undefined || resolved === undefined) return undefined;
    const theme = viewTheme(source, declared, options.theme);
    return { key: JSON.stringify([theme.name, layoutKey(resolved, theme)]), theme, resolved };
  };

  const geometryWithTheme = (view: string, themeName: string): Promise<CachedGeometry | undefined> => {
    const resolved = source === undefined ? undefined : resolveView(source, view);
    const theme = source?.themes.find(({ name }) => name === themeName);
    if (resolved === undefined || theme === undefined) return Promise.resolve(undefined);
    return layoutView(resolved, theme).then((geometry) => ({ view, theme: theme.name, layoutKey: layoutKey(resolved, theme), geometry }));
  };

  const geometry = (view: string, { theme }: GeometryOptions = {}): Promise<CachedGeometry | undefined> => {
    if (theme !== undefined) return geometryWithTheme(view, theme);
    const keyed = keyOf(view);
    if (keyed === undefined) return Promise.resolve(undefined);
    const existing = memo.get(view);
    if (existing !== undefined) return existing.result;
    const previousEntry = previousMemo.get(view);
    const result =
      previousEntry !== undefined && previousEntry.key === keyed.key
        ? previousEntry.result
        : layoutView(keyed.resolved, keyed.theme).then((geometry) => ({
            view,
            theme: keyed.theme.name,
            layoutKey: layoutKey(keyed.resolved, keyed.theme),
            geometry,
          }));
    memo.set(view, { key: keyed.key, result });
    return result;
  };

  const warnings = async (views: readonly string[]): Promise<Issue[]> => {
    const issues: Issue[] = [];
    for (const view of views) {
      const cached = await geometry(view);
      if (cached !== undefined) issues.push(...pinWarnings(view, cached.geometry, pins));
    }
    return issues;
  };

  const session: Session = {
    source,
    locate: compiled.ubicar,
    themeOrigins: compiled.origenesDeTemas ?? {},
    async diagnose() {
      if (source === undefined) return [...compiled.issues, ...adapterIssues];
      const accessibility = [...accessibilityWarnings(source, compiled.ubicar, options.theme), ...codeWarnings(source, compiled.ubicar, options.components), ...fontWarnings(source, compiled.ubicar, options.fontFiles)];
      const withPins = source.views.filter(({ id }) => pins.filter((pin) => pin.view === id).length >= 2);
      return [...compiled.issues, ...adapterIssues, ...accessibility, ...(await warnings(withPins.map(({ id }) => id)))];
    },
    async build() {
      if (source === undefined) return { files: {}, issues: [...compiled.issues, ...adapterIssues] };
      const output: BuildOutput = { 'canonico.json': json(source) };
      for (const { id } of source.views) {
        const cached = await geometry(id);
        if (cached !== undefined) output[`geometria/${id}.json`] = json(cached);
      }
      const issues = [...compiled.issues, ...adapterIssues, ...accessibilityWarnings(source, compiled.ubicar, options.theme), ...codeWarnings(source, compiled.ubicar, options.components), ...fontWarnings(source, compiled.ubicar, options.fontFiles), ...(await warnings(source.views.map(({ id }) => id)))];
      return { files: output, issues };
    },
    geometry,
    style: (view) => {
      const keyed = keyOf(view);
      if (keyed === undefined || source === undefined) return undefined;
      const declared = source.views.find(({ id }) => id === view);
      if (declared === undefined) return undefined;
      const kinds = Object.fromEntries(source.specification.nodeTypes.map((kind) => [kind.name, typeof kind['color'] === 'string' ? kind['color'] : undefined]));
      return resolvedStyle(keyed.theme, { tipos: kinds, diagrama: declared.type, ...(options.fontFiles !== undefined && { archivosDeFuente: options.fontFiles }), ...(declared.themePatch !== undefined && { vista: readOps(declared.themePatch) }) });
    },
    query: (query) => {
      if (source === undefined || compiled.ubicar === undefined) return undefined;
      if (query.command !== 'theme') return runQuery(source, compiled.ubicar, query);
      const { argument, command: _command, ...options } = query;
      return queryTheme(source, compiled.origenesDeTemas ?? {}, argument, options);
    },
    viewsWithGeometry: () => [...memo.keys()],
    update: (nextFiles, changes = {}) => createSession(nextFiles, { ...options, ...changes }, compile(nextFiles), memo),
  };
  return session;
}

/** Compiles once and leaves layout on demand. Pure over `files`: it neither reads disk nor watches changes. */
export function openSession(files: ArchivosDelWorkspace, options: SessionOptions = {}): Session {
  return createSession(files, options, compile(files), new Map());
}
