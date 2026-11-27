/** `slots` block of a Theme: layout validated by `theme`'s layout builder and the style of each Slot. */
import { SLOT_DEFINITION, buildLayout } from 'theme';
import type { SlotLayoutBox, ThemeElement, SlotName, BoxInput, SlotInput, CatalogError, Primitive, WrittenProperty } from 'theme';

import type { LayerProp, SlotBox, SlotEntry, ThemeSlots } from './generated/ast';
import { toRange, rangeOf } from './positions';
import { themeIssue, propertyStart, keyProperty, resolvedProperties, looseFamily } from './themes-common';
import type { Context } from './themes-common';

type SlotChildNode = SlotBox | SlotEntry;
type SlotsOrigin = ThemeSlots | SlotBox | SlotEntry | LayerProp;

const isBox = (child: SlotChildNode): child is SlotBox => child.$type === 'SlotBox';

/** The culprit property (key or value depending on the error) or, if there is none, the element. */
function site(origin: SlotsOrigin, error: CatalogError): { line: number; column: number } {
  if (origin.$type === 'LayerProp') return propertyStart(origin, error);
  const property = origin.$type === 'SlotEntry' ? 'name' : 'direction';
  const range = rangeOf(origin, property);
  // `slots { ... }` without a written direction: located at the start of the block.
  return range.start.line === 1 && range.start.column === 1 && origin.$cstNode !== undefined ? toRange(origin.$cstNode.range).start : range.start;
}

/** The Node, the Group header or the closed Group. */
export interface SlotsTarget {
  slots?: SlotLayoutBox | undefined;
  textos?: Partial<Record<SlotName, Primitive>> | undefined;
}

/** Errors end up in `ctx.issues`. */
export function compileSlots(item: ThemeSlots, target: SlotsTarget, ctx: Context, element: ThemeElement = 'nodo'): void {
  const errors: Array<{ error: CatalogError; origin: SlotsOrigin }> = [];
  const props = (list: readonly LayerProp[]): Array<WrittenProperty<SlotsOrigin>> => {
    const resolvedList = resolvedProperties(list, ctx.tokens);
    for (const error of resolvedList.errors) errors.push({ error, origin: (error.key === undefined ? undefined : keyProperty(list, error.key)) ?? item });
    return resolvedList.props;
  };
  const box = (node: ThemeSlots | SlotBox): BoxInput<SlotsOrigin> => ({
    ref: node,
    direccion: node.direction ?? 'column',
    props: props(node.props),
    hijos: node.children.map((child): BoxInput<SlotsOrigin> | SlotInput<SlotsOrigin> => {
      if (isBox(child)) return box(child);
      const align = child.props.find((p) => p.key === 'align');
      return { ref: child, slot: child.name, ...(align !== undefined && { align: { key: 'align', value: align.value, ref: align } }) };
    }),
  });
  const { disposicion: layout, errors: fromTree } = buildLayout(box(item), element);
  for (const { ref, ...error } of fromTree) errors.push({ error, origin: ref });
  for (const { error, origin } of errors) ctx.issues.push(themeIssue(ctx.file, error, site(origin, error)));
  if (layout === undefined || errors.length > 0) return;

  target.slots = layout;
  const entries = leaves(item.children);
  const texts: NonNullable<SlotsTarget['textos']> = Object.fromEntries(Object.entries(target.textos ?? {}).filter(([slot]) => entries.some((e) => e.name === slot)));
  target.textos = texts;
  for (const entry of entries) {
    const own = entry.props.filter((p) => p.key !== 'align');
    if (own.length === 0 || !Object.hasOwn(SLOT_DEFINITION, entry.name)) continue;
    const style = looseFamily(SLOT_DEFINITION[entry.name as SlotName].style, own, 'texto-slot', ctx, rangeOf(entry, 'name').start);
    if (style !== undefined) texts[entry.name as SlotName] = style;
  }
}

const leaves = (childItems: readonly SlotChildNode[]): SlotEntry[] => childItems.flatMap((child) => (isBox(child) ? leaves(child.children) : [child]));
