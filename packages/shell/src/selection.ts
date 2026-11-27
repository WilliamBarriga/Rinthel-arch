/** Element Selection: controlled by ids (`selected`, `selection`) or own. */
import { useMemo, useState } from 'react';

import type { ResolvedView } from 'canonical';
import type { VisualState, States } from 'render';

import { EMPTY_SELECTION, elementById, select } from './interaction';
import type { SelectableElement, Selection } from './interaction';

export interface SelectionResult {
  states: States;
  /** Applies the click on an element; returns whether it stays selected (to report and navigate). */
  press: (element: SelectableElement, accumulates: boolean) => { selected: boolean; selection: Selection };
}

/** Merges into the selection states those of hover (id under the mouse) and ghost (id being dragged). */
export function withTransientStates(base: States, hover: string | undefined, ghost: string | undefined): States {
  if (hover === undefined && ghost === undefined) return base;
  const joined: Record<string, readonly VisualState[]> = { ...base };
  if (hover !== undefined) joined[hover] = [...(joined[hover] ?? []), 'hover'];
  if (ghost !== undefined) joined[ghost] = [...(joined[ghost] ?? []), 'ghost'];
  return joined;
}

export function useSelection(
  view: ResolvedView,
  selected: string | null | undefined,
  selection?: readonly string[],
): SelectionResult & { selection: Selection } {
  const [own, setOwn] = useState<Selection>(EMPTY_SELECTION);
  const selectionList = useMemo<Selection>(() => {
    if (selection !== undefined) return selection.map((id) => elementById(view, id));
    if (selected === undefined) return own;
    const element = selected === null ? undefined : elementById(view, selected);
    return element === undefined ? EMPTY_SELECTION : [element];
  }, [selection, selected, own, view]);
  const states = useMemo<States>(() => {
    const byId: Record<string, ['selected']> = {};
    for (const element of selectionList) byId[element.id] = ['selected'];
    return byId;
  }, [selectionList]);
  const press = (element: SelectableElement, accumulates: boolean): { selected: boolean; selection: Selection } => {
    const next = select(selectionList, element, accumulates ? 'alternar' : 'reemplazar');
    if (selected === undefined && selection === undefined) setOwn(next);
    return { selected: next.some((e) => e.kind === element.kind && e.id === element.id), selection: next };
  };
  return { selection: selectionList, states, press };
}
