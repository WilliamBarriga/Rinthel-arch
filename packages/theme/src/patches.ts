/**
 * Patches by Layer name (never by index) and cascade: base Theme, Diagram type (`themeForDiagram`, before
 * the cascade), Node kind, state and View override; the last one wins.
 */
import { CODES, VIEW_TYPES, nearestCandidates } from 'canonical';

import { CATALOG, buildPrimitive, oldValueError, suggest } from './catalog';
import type { PrimitiveDefinition, CatalogError, Primitive, PrimitivePlacement } from './catalog';
import type { ResolvedTheme } from './theme';
import type { Animation } from './animation';

/**
 * In precedence order (the last one wins). `focus` and `on-path` are computed by the shell; `planned` comes from the Model (Planned
 * mark, ADR 0011) and goes first: any interaction state is painted over it.
 */
export const STATES = ['planned', 'hover', 'selected', 'ghost', 'on-path', 'dimmed', 'focus'] as const;
export type State = (typeof STATES)[number];
/** The ones a Theme tells apart with `diagram <type> { ... }`. */
export const DIAGRAM_TYPES = VIEW_TYPES;
export type DiagramType = (typeof VIEW_TYPES)[number];

/** Goes under the content unless `encima`. */
export interface ResolvedLayer {
  nombre: string;
  primitiva: Primitive;
  encima?: true;
  animacion?: Animation;
}

/** With `$token`s already resolved. */
export interface LayerOp {
  nombre: string;
  quitar?: true;
  /** Replaces the Primitive; without it, `props` merges over the current ones. */
  primitiva?: string;
  props: Record<string, string | number>;
  /** `null` removes it (`motion none`); without the key it is kept. */
  animacion?: Animation | null;
  antes?: string;
  despues?: string;
  encima?: true;
}

export interface OpError extends CatalogError {
  indice: number;
  donde: 'nombre' | 'ubicacion' | 'propiedad';
  /** Layer of the stack the patch touches. */
  base?: string;
}

/** `definir` appends new Layers at the end without placement; `parchear` requires `before`/`after` for every new Layer. */
export type PatchMode = 'definir' | 'parchear';

export function applyOps(
  stack: readonly ResolvedLayer[],
  ops: readonly LayerOp[],
  palette: Readonly<Record<string, string>>,
  mode: PatchMode,
  placement: PrimitivePlacement = 'capa-nodo',
): { pila: ResolvedLayer[]; errores: OpError[] } {
  const layers = stack.map((c) => ({ ...c, primitiva: { ...c.primitiva, props: { ...c.primitiva.props } } }));
  const errors: OpError[] = [];
  const indexOf = (name: string): number => layers.findIndex((c) => c.nombre === name);
  const names = (): string[] => layers.map((c) => c.nombre);
  /** An old built-in Layer name (`borde`) whose new name (`border`) is in the stack: `old-catalog-value` with its fix. */
  const oldLayer = (name: string): CatalogError | undefined => {
    const error = oldValueError('layer', name);
    return error?.candidato !== undefined && indexOf(error.candidato) >= 0 ? error : undefined;
  };

  ops.forEach((op, index) => {
    const failure = (e: CatalogError, where: OpError['donde'], base?: string): void => {
      errors.push({ ...e, indice: index, donde: where, ...(base !== undefined && { base }) });
    };
    const current = indexOf(op.nombre);

    if (op.quitar === true) {
      if (current < 0) {
        failure(oldLayer(op.nombre) ?? { codigo: CODES.E_THEME_UNKNOWN_LAYER, mensaje: `Cannot remove Layer '${op.nombre}': it does not exist`, ...suggest(op.nombre, names()) }, 'nombre');
      } else layers.splice(current, 1);
      return;
    }

    const side = op.antes !== undefined ? 'antes' : op.despues !== undefined ? 'despues' : undefined;
    const target = op.antes ?? op.despues;
    if (target !== undefined && (indexOf(target) < 0 || target === op.nombre)) {
      failure(
        (target === op.nombre ? undefined : oldLayer(target)) ?? {
          codigo: CODES.E_THEME_UNKNOWN_LAYER,
          mensaje: target === op.nombre ? `Layer '${op.nombre}' cannot be placed relative to itself` : `${side === 'antes' ? 'before' : 'after'} '${target}': that Layer does not exist`,
          ...suggest(target, names().filter((n) => n !== op.nombre)),
        },
        'ubicacion',
        current >= 0 ? op.nombre : undefined,
      );
      return;
    }

    const existing = current >= 0 ? layers[current] : undefined;
    if (existing === undefined && target === undefined && mode === 'parchear') {
      failure(
        oldLayer(op.nombre) ?? {
          codigo: CODES.E_THEME_PATCH_WITHOUT_PLACEMENT,
          mensaje: `Layer '${op.nombre}' does not exist; to add it, give 'before' or 'after' another Layer`,
          ...suggest(op.nombre, names()),
        },
        'nombre',
      );
      return;
    }
    if (existing === undefined && op.primitiva === undefined) {
      failure({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `The new Layer '${op.nombre}' requires a Primitive` }, 'nombre');
      return;
    }

    const kind = op.primitiva ?? existing?.primitiva.tipo ?? '';
    const props = Object.entries(op.primitiva === undefined ? { ...existing?.primitiva.props, ...op.props } : op.props).map(([key, value]) => ({ clave: key, valor: value }));
    const { primitiva: primitive, errores: fromCatalog } = buildPrimitive(kind, props, palette, placement);
    for (const e of fromCatalog) failure(e, e.clave === undefined ? 'nombre' : 'propiedad', existing?.nombre);
    if (primitive === undefined) return;

    const above = op.encima === true || existing?.encima === true;
    const animation = op.animacion === undefined ? existing?.animacion : (op.animacion ?? undefined);
    const added: ResolvedLayer = { nombre: op.nombre, primitiva: primitive, ...(above && { encima: true as const }), ...(animation !== undefined && { animacion: animation }) };
    if (existing !== undefined) layers.splice(current, 1);
    const site = target === undefined ? (current >= 0 ? current : layers.length) : indexOf(target) + (side === 'despues' ? 1 : 0);
    layers.splice(site, 0, added);
  });
  return { pila: layers, errores: errors };
}

/** Returns the errors of the stack that best accepts the patches: one valid for some Node kind is not rejected because of another. */
export function validateOps(
  candidates: ReadonlyArray<readonly ResolvedLayer[]>,
  ops: readonly LayerOp[],
  palette: Readonly<Record<string, string>>,
  mode: PatchMode,
  placement: PrimitivePlacement = 'capa-nodo',
): OpError[] {
  let best: OpError[] | undefined;
  for (const stack of candidates) {
    const { errores: errors } = applyOps(stack, ops, palette, mode, placement);
    if (best === undefined || errors.length < best.length) best = errors;
    if (best.length === 0) break;
  }
  return best ?? [];
}

export type ThemeElement = 'nodo' | 'grupo';

/**
 * Order: base, Node kind, `colapsado` (Group only), state, View override (Node only); the last one wins.
 * A patch whose Layer is not in this stack is ignored.
 */
export function cascade(
  theme: Pick<ResolvedTheme, 'palette' | 'nodo' | 'grupo'>,
  level: { tipo?: string; estado?: State; vista?: readonly LayerOp[]; colapsado?: boolean } = {},
  element: ThemeElement = 'nodo',
): ResolvedLayer[] {
  const apply = (stack: ResolvedLayer[], ops: readonly LayerOp[] | undefined): ResolvedLayer[] =>
    ops === undefined || ops.length === 0 ? stack : applyOps(stack, ops, theme.palette, 'parchear').pila;
  const block = theme[element];
  const byKind = apply(block.capas as ResolvedLayer[], level.tipo === undefined ? undefined : block.tipos[level.tipo]);
  const byCollapse = element === 'grupo' && level.colapsado === true ? apply(byKind, theme.grupo.colapsado.ops) : byKind;
  const byState = apply(byCollapse, level.estado === undefined ? undefined : block.estados[level.estado]);
  return element === 'nodo' ? apply(byState, level.vista) : byState;
}

/** Reason why a state patch touches the Metrics in any of `stacks`, or `undefined` if it only paints. */
export function opTouchesMetrics(op: LayerOp, stacks: ReadonlyArray<readonly ResolvedLayer[]>): string | undefined {
  const existing = stacks.flatMap((stack) => stack.filter((layer) => layer.nombre === op.nombre))[0];
  const affects = (kind: string | undefined): boolean => kind !== undefined && ((CATALOG as Record<string, PrimitiveDefinition>)[kind]?.afectaMetricas ?? false);
  if (op.quitar === true) return affects(existing?.primitiva.tipo) ? `Layer '${op.nombre}' defines the box and cannot be removed` : undefined;
  const newPrimitive = op.primitiva ?? existing?.primitiva.tipo;
  if (affects(newPrimitive)) return `Layer '${op.nombre}' uses '${newPrimitive}', which affects the Metrics`;
  return affects(existing?.primitiva.tipo) ? `Layer '${op.nombre}' replaces a shape that defines the box` : undefined;
}

export type StateResult =
  | { estado: State }
  | { error: { code: typeof CODES.E_THEME_UNKNOWN_STATE | typeof CODES.E_OLD_CATALOG_VALUE; message: string; candidatos: string[] } };

/** Error `theme-unknown-state` with nearby candidates if it is not in `STATES`; an old name is `old-catalog-value` with the new one as its only candidate. */
export function parseState(written: string): StateResult {
  const state = STATES.find((e) => e === written);
  if (state !== undefined) return { estado: state };
  const old = oldValueError('state', written);
  if (old?.candidato !== undefined) return { error: { code: CODES.E_OLD_CATALOG_VALUE, message: old.mensaje, candidatos: [old.candidato] } };
  return {
    error: {
      code: CODES.E_THEME_UNKNOWN_STATE,
      message: `Unknown state '${written}'; available: ${STATES.join(', ')}`,
      candidatos: nearestCandidates(written, STATES),
    },
  };
}
