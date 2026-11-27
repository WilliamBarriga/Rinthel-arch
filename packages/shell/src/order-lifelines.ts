/**
 * Reordering Lifelines by drag, pure over the `SequenceGeometry`. A unit (Lifeline or block of a `box`) only
 * moves among its siblings inside the `box` that contains it, and that Group's own Lifeline stays first.
 */
import type { GroupBox, SequenceGeometry } from 'canonical';

import { contains } from './box';

export interface DraggedUnit {
  /** Lifeline (or Group, if `block`) that was grabbed. */
  id: string;
  block: boolean;
}

/** What is grabbed at `point`: the header of a Lifeline or the title of a `box`; nothing if it falls on neither. */
export function unitAt(g: SequenceGeometry, groups: readonly GroupBox[], point: { x: number; y: number }): DraggedUnit | undefined {
  for (const [id, box] of Object.entries(g.nodes)) {
    if (contains(box, point)) return { id, block: groups.some((group) => group.id === id) };
  }
  const title = g.groups.find((group) => contains(group.title, point));
  return title === undefined ? undefined : { id: title.id, block: true };
}

/** Visible order (ids from left to right) after dropping `unit` shifted by `dx`; the same `order` if it does not change place. */
export function orderAfterDrag(g: SequenceGeometry, groups: readonly GroupBox[], order: readonly string[], unitValue: DraggedUnit, dx: number): string[] {
  const members = unitValue.block ? (groups.find((group) => group.id === unitValue.id)?.lifelines ?? [unitValue.id]) : [unitValue.id];
  // Container box: the innermost `box` that spans the unit without being the unit itself.
  const container: GroupBox | undefined = groups
    .filter((group) => !(unitValue.block && group.id === unitValue.id) && members.every((m) => group.lifelines.includes(m)))
    .sort((a, b) => b.level - a.level)[0];
  const list = container?.lifelines ?? order;
  const start = order.indexOf(list[0]!);
  const fixed = container !== undefined && list[0] === container.id ? [container.id] : [];
  const movable = list.slice(fixed.length);

  // Sibling units: each loose Lifeline, or each whole child `box`.
  const childLevel = container === undefined ? 0 : container.level + 1;
  const key = (id: string): string =>
    groups.filter((group) => group.level >= childLevel && group.lifelines.includes(id)).sort((a, b) => a.level - b.level)[0]?.id ?? id;
  const units: string[][] = [];
  for (const id of movable) {
    const last = units.at(-1);
    if (last !== undefined && key(last[0]!) === key(id)) last.push(id);
    else units.push([id]);
  }
  const centerOf = (ids: readonly string[]): number => {
    const boxes = ids.map((id) => g.nodes[id]!);
    return (Math.min(...boxes.map((c) => c.x)) + Math.max(...boxes.map((c) => c.x + c.width))) / 2;
  };
  const grabbed = units.find((u) => u.includes(members[0]!));
  if (grabbed === undefined) return [...order];
  const middle = centerOf(grabbed) + dx;
  const others = units.filter((u) => u !== grabbed);
  const target = others.findIndex((u) => centerOf(u) > middle);
  others.splice(target < 0 ? others.length : target, 0, grabbed);
  const newList = [...fixed, ...others.flat()];
  return [...order.slice(0, start), ...newList, ...order.slice(start + list.length)];
}
