/**
 * Navigable listbox of the chrome (View index, Theme gallery): the focus stays on the `listbox` and the active option is
 * announced with `aria-activedescendant`. Arrows, Home and End move the active option; Enter or Space choose it, like a
 * click. With `choosesOnMove` the choice follows the focus (each arrow chooses). The active option goes back to the
 * chosen one when that changes from outside. The caller sets `role="group"` and the content of each option.
 */
import { useEffect, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent } from 'react';

export interface ListboxOptions {
  /** Accessible name of the `listbox`. */
  name: string;
  /** Prefix of the options' `id` (unique in the page). */
  prefix: string;
  /** Ids of the options in traversal order. */
  order: readonly string[];
  /** Chosen option (`aria-selected`), or `undefined`. */
  chosen: string | undefined;
  choose(id: string): void;
  choosesOnMove?: boolean;
}

export interface Listbox {
  listbox: HTMLAttributes<HTMLDivElement>;
  option(id: string, name?: string): HTMLAttributes<HTMLDivElement> & { id: string };
}

const NEXT: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => Math.min(n - 1, i + 1),
  ArrowUp: (i) => Math.max(0, i - 1),
  Home: () => 0,
  End: (_, n) => n - 1,
};

export function useListbox({ name, prefix, order, chosen, choose, choosesOnMove: choosesOnMove = false }: ListboxOptions): Listbox {
  const [cursor, setCursor] = useState<string>();
  useEffect(() => setCursor(undefined), [chosen]);
  const active = cursor !== undefined && order.includes(cursor) ? cursor : chosen;
  const idOf = (id: string): string => `${prefix}-${id}`;

  const onType = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.key === 'Enter' || e.key === ' ') && active !== undefined) {
      e.preventDefault();
      choose(active);
      return;
    }
    const move = NEXT[e.key];
    if (move === undefined || order.length === 0) return;
    e.preventDefault();
    const target = order[move(active === undefined ? -1 : order.indexOf(active), order.length)]!;
    setCursor(target);
    if (choosesOnMove && target !== chosen) choose(target);
    document.getElementById(idOf(target))?.scrollIntoView?.({ block: 'nearest' });
  };

  return {
    listbox: { role: 'listbox', 'aria-label': name, tabIndex: 0, onKeyDown: onType, ...(active !== undefined && { 'aria-activedescendant': idOf(active) }) },
    option: (id, label = id) => ({
      id: idOf(id),
      role: 'option',
      'aria-label': label,
      'aria-selected': id === chosen,
      ...(id === active && { 'data-activa': '' }),
      onClick: () => {
        setCursor(id);
        choose(id);
      },
    }),
  };
}
