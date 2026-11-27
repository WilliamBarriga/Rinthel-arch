/** `inspect theme`: the query of a Theme (`extends` chain, Layers, Group, Theme elements, Slots and Metrics). Pure. */
import { INSPECT_CONTRACT_VERSION, nearestCandidates } from 'canonical';
import type { CanonicalForm } from 'canonical';
import type { OrigenDeTema } from 'dsl';
import { CATALOG, EFFECTS, STATES, MOTIONS, DIAGRAM_TYPES, headerHeight, cascade, themeComponents, describeLayout, themeElements, nodeMetricsFor, parseState, resolveTheme, metricsTable, themeForDiagram } from 'theme';
import type { ResolvedLayer, DescribedLayer } from 'theme';

import type { QueryAnswer } from './queries';

type Site = { file: string; line: number };

/** Options of `inspect theme`: Node kind, state and Diagram type of the cascade, and whether the catalog is attached. */
export interface ThemeQueryOptions {
  kind?: string;
  state?: string;
  diagram?: string;
  catalog?: boolean;
}

const BUILT_IN: Site = { file: '(incorporado)', line: 1 };

/** `extends` chain, `part`s used, Layer stack for a Node kind and state (with the site that set each Layer), Metrics and code use. */
export function queryTheme(source: CanonicalForm, origins: Readonly<Record<string, OrigenDeTema>>, name: string, { kind, state, diagram, catalog: catalog = false }: ThemeQueryOptions = {}): QueryAnswer {
  const declared = source.themes.find((t) => t.name === name);
  if (declared === undefined) {
    const nearest = nearestCandidates(name, source.themes.map((t) => t.name));
    return { notFound: `No such Theme '${name}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`, suggestions: nearest };
  }
  const kinds = source.specification.nodeTypes.map((t) => t.name);
  if (kind !== undefined && !kinds.includes(kind)) {
    const nearest = nearestCandidates(kind, kinds);
    return { notFound: `No such Node kind '${kind}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}`, suggestions: nearest };
  }
  const parsed = state === undefined ? undefined : parseState(state);
  if (parsed !== undefined && 'error' in parsed) {
    const { candidatos: candidates } = parsed.error;
    return { notFound: `No such state '${state}'${candidates.length === 0 ? '' : `. Did you mean: ${candidates.join(', ')}`}. States: ${STATES.join(', ')}`, suggestions: [...candidates] };
  }
  const diagramType = diagram === undefined ? undefined : DIAGRAM_TYPES.find((t) => t === diagram);
  if (diagram !== undefined && diagramType === undefined) {
    const nearest = nearestCandidates(diagram, DIAGRAM_TYPES);
    return { notFound: `No such Diagram type '${diagram}'${nearest.length === 0 ? '' : `. Did you mean: ${nearest.join(', ')}`}. Types: ${DIAGRAM_TYPES.join(', ')}`, suggestions: nearest };
  }
  const validState = parsed === undefined || 'error' in parsed ? undefined : parsed.estado;

  const theme = themeForDiagram(resolveTheme(declared), diagramType);
  const components = themeComponents(declared);
  const origin = origins[name];
  const siteOf = (layer: string): Site => {
    // The most specific cascade level that set the Layer wins: state, Node kind, base.
    const site = (validState === undefined ? undefined : origin?.estados[validState]?.[layer]) ?? (kind === undefined ? undefined : origin?.tipos[kind]?.[layer]) ?? origin?.base[layer];
    return site === undefined ? (origin?.sitio ?? BUILT_IN) : { file: site.file, line: site.line };
  };
  const toLayer = (layer: ResolvedLayer, site: Site) => ({
    name: layer.nombre,
    primitive: layer.primitiva.tipo,
    props: layer.primitiva.props,
    above: layer.encima === true,
    animated: layer.animacion !== undefined,
    origin: site,
  });
  const layers = cascade(theme, { ...(kind !== undefined && { tipo: kind }), ...(validState !== undefined && { estado: validState }) }).map((layer: ResolvedLayer) => toLayer(layer, siteOf(layer.nombre)));
  const themeSite = origin?.sitio ?? BUILT_IN;
  const withOrigin = (layers: readonly DescribedLayer[]) => layers.map((layer) => ({ name: layer.nombre, primitive: layer.primitiva, props: layer.props, above: layer.encima, animated: layer.animada, origin: themeSite }));
  const described = themeElements(declared, diagramType, kind);
  const sequence = Object.fromEntries(
    Object.entries(described.secuencia ?? {}).map(([name, e]) => [name, { layers: withOrigin(e.capas), markers: e.marcadores, patches: Object.fromEntries(Object.entries(e.parches).map(([v, layers]) => [v, withOrigin(layers)])), metrics: e.metricas, ...(e.derivado === true && { derived: true as const }) }]),
  );
  const elements = {
    ...(described.secuencia !== undefined && { sequence }),
    ...(described.fila !== undefined && { row: { ...(described.fila.alto !== undefined && { height: described.fila.alto }), layers: withOrigin(described.fila.capas), ...(described.fila.derivado === true && { derived: true as const }) } }),
  };
  const page = {
    fixed: theme.pagina.fijo,
    layers: (theme.pagina.capas as ResolvedLayer[]).map((layer) => {
      const site = origin?.pagina[layer.nombre];
      return toLayer(layer, site === undefined ? (origin?.sitio ?? BUILT_IN) : { file: site.file, line: site.line });
    }),
  };
  // If no block writes the Slot layout, the Theme's (or the core's) applies.
  const slotsSite = (site: Site | undefined): Site => site ?? origin?.sitio ?? BUILT_IN;
  const table = metricsTable(declared, diagramType);
  const nodeMetrics = nodeMetricsFor(table, kind);
  const groupOrigin = origin?.grupo;
  const groupSiteOf = (layer: string, collapsed: boolean): Site => {
    // Cascade: state, collapsed, Node kind, base.
    const site =
      (validState === undefined ? undefined : groupOrigin?.estados[validState]?.[layer]) ??
      (collapsed ? groupOrigin?.colapsado[layer] : undefined) ??
      (kind === undefined ? undefined : groupOrigin?.tipos[kind]?.[layer]) ??
      groupOrigin?.base[layer];
    return site === undefined ? (origin?.sitio ?? BUILT_IN) : { file: site.file, line: site.line };
  };
  const groupStack = (collapsed: boolean) =>
    cascade(theme, { ...(kind !== undefined && { tipo: kind }), ...(validState !== undefined && { estado: validState }), ...(collapsed && { colapsado: collapsed }) }, 'grupo').map((layer: ResolvedLayer) => toLayer(layer, groupSiteOf(layer.nombre, collapsed)));
  const group = {
    own: theme.grupo.capas.length > 0,
    header: describeLayout(table.grupoAbierto.disposicion),
    headerOrigin: slotsSite(origin?.slots.grupo),
    headerHeight: headerHeight(table.grupoAbierto),
    padding: theme.grupo.padding,
    layers: groupStack(false),
    collapsed: { slots: describeLayout(table.grupoColapsado.disposicion), slotsOrigin: slotsSite(origin?.slots.colapsado ?? origin?.slots.nodo), layers: groupStack(true) },
  };
  return {
    output: {
      contractVersion: INSPECT_CONTRACT_VERSION,
      command: 'theme',
      theme: {
        name,
        ...(origin === undefined ? BUILT_IN : { file: origin.sitio.file, line: origin.sitio.line }),
        extends: origin?.extends ?? [],
        parts: origin?.partes ?? [],
        ...(kind !== undefined && { kind }),
        ...(validState !== undefined && { state: validState }),
        ...(diagramType !== undefined && { diagram: diagramType }),
        layers,
        page,
        group,
        ...(Object.keys(elements).length > 0 && { elements }),
        slots: describeLayout(nodeMetrics.disposicion),
        slotsOrigin: slotsSite(origin?.slots.nodo),
        // `paddingGrupo` belongs to the Group: the Node table carries the default value, which says nothing about this Theme.
        metrics: JSON.parse(JSON.stringify({ ...nodeMetrics, paddingGrupo: table.grupoAbierto.paddingGrupo })) as never,
        hasCode: components.length > 0,
        components,
        ...(catalog && { catalog: { primitives: Object.keys(CATALOG), motions: Object.keys(MOTIONS), effects: [...EFFECTS] } }),
      },
    },
  };
}
