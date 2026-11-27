/**
 * Layer stacks per element (Node, open Group, collapsed Group), with `.rd-<key>` selectors. A Node kind with
 * patches brings its whole stack and `data-tipo` picks it; a kind without patches uses the element's.
 */
import type { ResolvedNode } from 'canonical';
import type { Paint, ElementPaint, NodePaint } from 'theme';

/** Paint of Nodes and Groups: the Theme's or the derived activation's. */
type BoxPaints = Pick<Paint, 'nodo' | 'grupo'>;

const PAINT_OF = {
  nodo: (paint: BoxPaints): ElementPaint => paint.nodo,
  grupo: (paint: BoxPaints): ElementPaint => paint.grupo.abierto,
  colapsado: (paint: BoxPaints): ElementPaint => paint.grupo.colapsado,
} as const;

export type ElementKey = keyof typeof PAINT_OF;

/** Keys in the order the sheet emits them. */
export const ELEMENTS = Object.keys(PAINT_OF) as readonly ElementKey[];

export const elementPaint = (paint: BoxPaints, key: ElementKey): ElementPaint => PAINT_OF[key](paint);

/** Element a visible Node is drawn with: a closed Group is a leaf with its own paint. */
export function keyOf(node: Pick<ResolvedNode, 'collapsed' | 'children'>): ElementKey {
  return node.collapsed ? 'colapsado' : node.children.length > 0 ? 'grupo' : 'nodo';
}

/** Selector of the `data-tipo` attribute of a Node kind. Names are DSL identifiers; other characters cannot appear. */
const ofKind = (kind: string): string => `[data-tipo="${kind.replace(/[^\w-]/g, '')}"]`;

/** A current stack: the element's without a kind or a patched kind's, with the selectors that reach it. */
export interface CurrentStack {
  key: ElementKey;
  kind?: string;
  /** Selector (with `&` for the scope class) of the element that carries it. */
  selector: string;
  /** Selector of the `.rd-caja` box that contains that element and the outline of its states. */
  box: string;
  stack: NodePaint;
}

/** The stacks of an element: the base one (the one without `data-tipo` if some kinds have their own stack) and one per patched kind. */
export function elementStacks(paint: Paint, key: ElementKey): CurrentStack[] {
  const element = elementPaint(paint, key);
  const kinds = Object.keys(element.tipos);
  const current = (filterEl: string, stack: NodePaint, kind?: string): CurrentStack => ({
    key: key,
    ...(kind !== undefined && { kind }),
    selector: `& .rd-${key}${filterEl}`,
    box: `& .rd-caja[data-elemento="${key}"]${filterEl}`,
    stack: stack,
  });
  return [current(kinds.length === 0 ? '' : ':not([data-tipo])', element), ...kinds.map((kind) => current(ofKind(kind), element.tipos[kind]!, kind))];
}

/** Stack a Node is drawn with: its kind's if the Theme patches it, otherwise the element's; `kind` is what its `data-tipo` carries. */
export function nodeStack(paint: BoxPaints, node: Pick<ResolvedNode, 'collapsed' | 'children' | 'type'>): { key: ElementKey; kind?: string; stack: NodePaint } {
  const key = keyOf(node);
  const element = elementPaint(paint, key);
  const own = Object.hasOwn(element.tipos, node.type);
  return { key, ...(own && { kind: node.type }), stack: own ? element.tipos[node.type]! : element };
}
