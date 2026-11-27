/**
 * Layout of a sequence View, without ELK, deterministic and synchronous. One column per Lifeline in the order of
 * `view.nodes` and one row per Message. Each nested activation level shifts half an activation width and the
 * arrows end at the edge of the current activation.
 */
import { activationsOf } from 'canonical';
import type { Activation, ActivationBox, PlacedGroupBox, NodeBox, SequenceGeometry, ResolvedItem, FragmentFrame, ResolvedMessage, PlacedNote, ResolvedNote, PlacedOperand, MessageRoute, SequenceView } from 'canonical';
import { NOTE_CORNER, noteBox, placeInBox, placeNode, asTable, nodeContent, leafMetrics, labelSize, guardText } from 'theme';
import type { Metrics, MetricsTable } from 'theme';



/** Width something needs between columns `from` and `to` (Lifeline indices): a label, a Note. */
interface WidthNeed {
  from: number;
  to: number;
  width: number;
}

// px the Theme does not tune; the tunable separations are `Metrics.secuencia`.
const MARGIN = 24;
const HEAD_SEPARATION = 24;
const LABEL_SLACK = 24;
const SELF_LOOP_HEIGHT = 28;
const SPACE_BEFORE_MESSAGE = 12;
const BOTTOM_PADDING = 24;
const NESTING_INDENT = 10;
const GAP_BETWEEN_FRAGMENTS = 10;
const TAB_SLACK = 12;
const GUARD_SLACK = 8;
const NOTE_GAP = 12;
const NOTE_OVERHANG = 8;
const SPACE_BETWEEN_NOTES = 8;
const GROUP_H_PADDING = 8;
const GROUP_V_PADDING = 4;
const TITLE_SLACK = 8;

/** Levels of nested Fragments in a list of items (0 if there is none); `target` receives, per Fragment, how many levels lie below it. */
function depthOf(items: readonly ResolvedItem[], target = new Map<string, number>()): number {
  return Math.max(
    0,
    ...items.map((item) => {
      if (item.type === 'message' || item.type === 'note') return 0;
      if (item.type === 'ref') {
        target.set(item.path, 0);
        return 1;
      }
      const inside = Math.max(0, ...item.operands.map((operand) => depthOf(operand.items, target)));
      target.set(item.path, inside);
      return 1 + inside;
    }),
  );
}

function notesOf(items: readonly ResolvedItem[]): ResolvedNote[] {
  return items.flatMap((item): ResolvedNote[] => (item.type === 'note' ? [item] : item.type === 'fragment' ? item.operands.flatMap((o) => notesOf(o.items)) : []));
}

export function layoutSequence(view: SequenceView, metricas: Metrics | MetricsTable): SequenceGeometry {
  const table = asTable(metricas);
  const seq = table.base.secuencia;
  if (seq === undefined) throw new Error('layoutSequence: the Metrics table has no sequence part; compute it with metricsTable(theme, \'sequence\')');
  const lifelineGap = seq.huecoEntreLifelines;
  const activationWidth = seq.anchoDeActivacion;
  const loopWidth = seq.anchoDeLazo;
  const spaceAfterMessage = Math.max(0, seq.huecoEntreMensajes - SPACE_BEFORE_MESSAGE);
  const fragmentHPadding = seq.rellenoDeFragmento;
  const fragmentBottomPadding = seq.rellenoVerticalDeFragmento;
  const fragmentTopPadding = Math.max(2, fragmentBottomPadding - 4);
  const messageList = view.interaction.messages;
  const interactionItems = view.interaction.items;
  const lifelines = view.nodes;
  const column = new Map(lifelines.map((node, i) => [node.id, i]));

  // Heads: each with its Node size, all with the height of the tallest.
  const measures = lifelines.map((node) => {
    const m = leafMetrics(table, node);
    return placeNode(nodeContent(node, m), m);
  });
  const headHeight = Math.max(0, ...measures.map(({ height }) => height));
  const labelWidth = (message: ResolvedMessage): number => (message.label === undefined ? 0 : labelSize(message.label, table.etiqueta).width);
  const labelHeight = (message: ResolvedMessage): number => (message.label === undefined ? 0 : labelSize(message.label, table.etiqueta).height);

  const gaps = lifelines.slice(1).map((_, i) => Math.max(lifelineGap, (measures[i]!.width + measures[i + 1]!.width) / 2 + HEAD_SEPARATION));
  const widthNeedOf = (message: ResolvedMessage): WidthNeed | undefined => {
    const a = column.get(message.from);
    const b = column.get(message.to);
    if (a === undefined || b === undefined) return undefined;
    if (a === b) return a + 1 < lifelines.length ? { from: a, to: a + 1, width: loopWidth + labelWidth(message) + LABEL_SLACK } : undefined;
    return { from: Math.min(a, b), to: Math.max(a, b), width: labelWidth(message) + LABEL_SLACK + activationWidth };
  };
  // Messages from narrowest to widest span: the missing gap is added to the last stretch of the span.
  // Notes: `over X, Y` asks for the box to fit between X and Y (with its overhang); `left of`/`right of` ask for a gap with the neighbor.
  const noteBoxes = new Map(notesOf(interactionItems).map((note) => [note.path, noteBox(note.text, table.etiqueta)]));
  const noteRequests = notesOf(interactionItems).flatMap((note): WidthNeed[] => {
    const box = noteBoxes.get(note.path)!;
    const cols = note.targets.map((id) => column.get(id)!);
    const a = Math.min(...cols);
    const b = Math.max(...cols);
    if (note.anchor === 'over') return a === b ? [] : [{ from: a, to: b, width: box.width - 2 * NOTE_OVERHANG }];
    if (note.anchor === 'left') return a > 0 ? [{ from: a - 1, to: a, width: box.width + 2 * NOTE_GAP }] : [];
    return a + 1 < lifelines.length ? [{ from: a, to: a + 1, width: box.width + 2 * NOTE_GAP }] : [];
  });
  const requests = [...messageList.flatMap((message) => widthNeedOf(message) ?? []), ...noteRequests].sort((x, y) => x.to - x.from - (y.to - y.from) || x.from - y.from);
  for (const { from, to, width } of requests) {
    const current = gaps.slice(from, to).reduce((sum, h) => sum + h, 0);
    if (current < width) gaps[to - 1] = gaps[to - 1]! + (width - current);
  }

  // `box` of open Groups: each level reserves a title band above the heads and padding on the sides.
  const groupList = view.interaction.groups ?? [];
  const levels = Math.max(0, ...groupList.map((g) => g.level + 1));
  const titles = new Map(groupList.map((g) => [g.id, labelSize(g.label, table.etiqueta)]));
  const titleHeight = Math.max(0, ...[...titles.values()].map((t) => t.height)) + TITLE_SLACK;
  const padding = (level: number): number => GROUP_H_PADDING * (levels - level);
  const ends = new Map(groupList.map((g) => [g.id, { from: Math.min(...g.lifelines.map((id) => column.get(id)!)), to: Math.max(...g.lifelines.map((id) => column.get(id)!)) }]));
  // The gap between two columns adds the padding of the box ending on the left and of the one starting on the right.
  for (let k = 0; k + 1 < lifelines.length; k++) {
    const endingPadding = Math.max(0, ...groupList.filter((g) => ends.get(g.id)!.to === k).map((g) => padding(g.level)));
    const startingPadding = Math.max(0, ...groupList.filter((g) => ends.get(g.id)!.from === k + 1).map((g) => padding(g.level)));
    gaps[k] = gaps[k]! + endingPadding + startingPadding;
  }
  const centers: number[] = [];
  const levelsBelow = new Map<string, number>();
  const depth = depthOf(interactionItems, levelsBelow);
  const leftMargin = MARGIN + Math.max(depth > 0 ? fragmentHPadding + NESTING_INDENT * (depth - 1) : 0, ...groupList.filter((g) => ends.get(g.id)!.from === 0).map((g) => padding(g.level)));
  const firstColumnOverhang = Math.max(
    0,
    ...notesOf(interactionItems).flatMap((note) => {
      if (!note.targets.some((id) => column.get(id) === 0)) return [];
      const width = noteBoxes.get(note.path)!.width;
      return [note.anchor === 'left' ? width + NOTE_GAP : note.anchor === 'over' && note.targets.length === 1 ? width / 2 : NOTE_OVERHANG];
    }),
  );
  lifelines.forEach((_, i) => centers.push(i === 0 ? leftMargin + Math.max((measures[0]?.width ?? 0) / 2, firstColumnOverhang) : centers[i - 1]! + gaps[i - 1]!));
  const lifelineX = (id: string): number => Math.round(centers[column.get(id)!]!);
  const headY = MARGIN + levels * titleHeight + (levels > 0 ? GROUP_V_PADDING : 0);
  const startY = headY + headHeight + MARGIN;

  // Rows: the `y` of each arrow, top to bottom; a Fragment adds tab, guard and top padding, bottom padding and a divider per operand.
  const { activations: activationList } = activationsOf(messageList);
  const createdAt = (id: string): number => messageList.findIndex((m) => m.kind === 'create' && m.to === id);
  const destroyedAt = (id: string): number => messageList.findIndex((m) => m.kind === 'destroy' && m.to === id);
  const indexOf = new Map(messageList.map((m, i) => [m.path, i]));
  const ys: number[] = [];
  const loopHeights: number[] = [];
  const frames: FragmentFrame[] = [];
  /** Messages (paths) inside each Fragment, nested ones included. */
  const contents = new Map<string, string[]>();
  /** Horizontal ends of the Notes of each Fragment and columns of each `ref`. */
  const noteEnds = new Map<string, number[]>();
  const refColumns = new Map<string, number[]>();
  const noteList: PlacedNote[] = [];
  let cursor = startY;
  const placeMessage = (message: ResolvedMessage): void => {
    const i = indexOf.get(message.path)!;
    const height = labelHeight(message);
    if (message.from === message.to) {
      loopHeights[i] = Math.max(SELF_LOOP_HEIGHT, height);
      ys[i] = cursor + SPACE_BEFORE_MESSAGE;
      cursor = ys[i]! + loopHeights[i]! + spaceAfterMessage;
    } else if (message.kind === 'create') {
      // The target's head is centered on the arrow: it needs half a head height above and below.
      ys[i] = Math.max(cursor + height + SPACE_BEFORE_MESSAGE, cursor + headHeight / 2);
      cursor = ys[i]! + Math.max(spaceAfterMessage, headHeight / 2 + SPACE_BEFORE_MESSAGE);
    } else {
      ys[i] = cursor + height + SPACE_BEFORE_MESSAGE;
      cursor = ys[i]! + spaceAfterMessage;
    }
  };
  /** Returns the depth of nested Fragments they contain (0 if none). */
  const placeItems = (items: readonly ResolvedItem[], level: number, routes: string[], collectedEnds: number[]): number => {
    let nestedDepth = 0;
    for (const item of items) {
      if (item.type === 'message') {
        placeMessage(item.message);
        routes.push(item.message.path);
        continue;
      }
      if (item.type === 'note') {
        const box = noteBoxes.get(item.path)!;
        const cols = item.targets.map((id) => lifelineX(id));
        const left = Math.min(...cols);
        const right = Math.max(...cols);
        const width = item.anchor === 'over' && cols.length > 1 && left !== right ? Math.max(box.width, right - left + 2 * NOTE_OVERHANG) : box.width;
        const nx = item.anchor === 'left' ? left - NOTE_GAP - width : item.anchor === 'right' ? right + NOTE_GAP : Math.round((left + right) / 2 - width / 2);
        const top = cursor + SPACE_BETWEEN_NOTES;
        noteList.push({ ruta: item.path, anchor: item.anchor, x: nx, y: top, width, height: box.height, lines: box.lines, lineHeight: box.lineHeight, fold: NOTE_CORNER });
        collectedEnds.push(nx, nx + width);
        cursor = top + box.height + SPACE_BETWEEN_NOTES;
        continue;
      }
      if (item.type === 'ref') {
        const top = cursor + GAP_BETWEEN_FRAGMENTS;
        const tabSize = labelSize('ref', table.etiqueta);
        const titleSize = labelSize(item.title, table.etiqueta);
        const tab = { x: 0, y: top, width: tabSize.width + TAB_SLACK, height: tabSize.height };
        const height = tabSize.height + titleSize.height + fragmentTopPadding + fragmentBottomPadding;
        frames.push({ ruta: item.path, operator: 'ref', nivel: level, x: 0, y: top, width: 0, height, tab, title: { text: item.title, box: { x: 0, y: top + tabSize.height + fragmentTopPadding / 2, ...titleSize } }, operands: [{ y1: top, y2: top + height }] });
        const columns = (item.participants.length > 0 ? item.participants : lifelines.map((l) => l.id)).map(lifelineX);
        refColumns.set(item.path, columns);
        // The Fragment containing the `ref` wraps it: its ends count for the parent frame.
        collectedEnds.push(...columns);
        cursor = top + height + GAP_BETWEEN_FRAGMENTS;
        nestedDepth = Math.max(nestedDepth, 1);
        continue;
      }
      const inside: string[] = [];
      const innerEnds: number[] = [];
      const top = cursor + GAP_BETWEEN_FRAGMENTS;
      const tabSize = labelSize(item.operator, table.etiqueta);
      const tab = { x: 0, y: top, width: tabSize.width + TAB_SLACK, height: tabSize.height };
      const frame: FragmentFrame = { ruta: item.path, operator: item.operator, nivel: level, x: 0, y: top, width: 0, height: 0, tab, operands: [] };
      frames.push(frame);
      let innerDepth = 0;
      item.operands.forEach((operand, k) => {
        const operandTop = k === 0 ? top : cursor;
        const guard = operand.guard === undefined ? undefined : guardText(operand.guard);
        const measured = guard === undefined ? undefined : labelSize(guard, table.etiqueta);
        const placed: PlacedOperand = { y1: operandTop, y2: operandTop, ...(k > 0 && { divider: operandTop }) };
        if (guard !== undefined && measured !== undefined) {
          // In the first operand the guard goes next to the tab; in the following ones, under its divider.
          placed.guard = { text: guard, box: { x: 0, y: operandTop, ...measured } };
        }
        const header = k === 0 ? Math.max(tab.height, measured?.height ?? 0) : (measured?.height ?? 0);
        cursor = operandTop + header + fragmentTopPadding;
        innerDepth = Math.max(innerDepth, placeItems(operand.items, level + 1, inside, innerEnds));
        cursor += fragmentBottomPadding;
        placed.y2 = cursor;
        frame.operands.push(placed);
      });
      frame.height = cursor - top;
      cursor += GAP_BETWEEN_FRAGMENTS;
      contents.set(item.path, inside);
      noteEnds.set(item.path, innerEnds);
      collectedEnds.push(...innerEnds);
      routes.push(...inside);
      nestedDepth = Math.max(nestedDepth, innerDepth + 1);
    }
    return nestedDepth;
  };
  placeItems(interactionItems, 0, [], []);
  const endY = cursor;
  const fragmentEnd = (route: string): number => {
    const frame = frames.find((m) => m.ruta === route)!;
    return frame.y + frame.height;
  };

  /** `y` of each Lifeline's head: the initial one, or centered on its `create` Message. */
  const headYOf = (id: string): number => {
    const c = createdAt(id);
    return c < 0 ? headY : Math.max(headY, Math.round(ys[c]! - headHeight / 2 + seq.desplazamientoDeCreate));
  };
  /** End `y` of the line: the bottom, or the `destroy` Message that cuts it. */
  const endYOf = (id: string): number => {
    const d = destroyedAt(id);
    return d < 0 ? endY : ys[d]!;
  };

  const activationBoxes: ActivationBox[] = activationList.map((a) => ({
    lifeline: a.lifeline,
    nivel: a.level,
    x: lifelineX(a.lifeline) + (a.level * activationWidth) / 2 - activationWidth / 2,
    y1: ys[a.from]!,
    y2: Math.min(a.closesAt !== undefined ? fragmentEnd(a.closesAt) : a.to === null ? endY : ys[a.to]!, endYOf(a.lifeline)),
    width: activationWidth,
  }));

  /** Index of the Message where the activation ends; one that closes a Fragment ends half an index after its last Message. */
  const cutoffs = new Map<Activation, number>();
  const cutoff = (a: Activation): number => {
    if (a.closesAt === undefined) return a.to ?? Infinity;
    let c = cutoffs.get(a);
    if (c === undefined) {
      c = Math.max(...messageList.flatMap((m, i) => (m.scope?.includes(a.closesAt!) ? [i] : []))) + 0.5;
      cutoffs.set(a, c);
    }
    return c;
  };
  /** Level of the most nested activation of `lifeline` current after (`after`) or just before sending Message `i`; -1 if none. */
  const currentLevel = (lifeline: string, i: number, after: boolean): number =>
    Math.max(-1, ...activationList.filter((a: Activation) => a.lifeline === lifeline && (after ? a.from <= i && cutoff(a) > i : a.from < i && cutoff(a) >= i)).map((a) => a.level));
  const edgeX = (lifeline: string, level: number, side: 'left' | 'right'): number =>
    level < 0 ? lifelineX(lifeline) : lifelineX(lifeline) + (level * activationWidth) / 2 + (side === 'right' ? 1 : -1) * (activationWidth / 2);

  let rightmost = 0;
  const routes: Record<string, MessageRoute> = {};
  messageList.forEach((message, i) => {
    const y = ys[i]!;
    const label = message.label === undefined ? undefined : labelSize(message.label, table.etiqueta);
    if (message.from === message.to) {
      const start = edgeX(message.from, currentLevel(message.from, i, false), 'right');
      const end = edgeX(message.from, currentLevel(message.to, i, true), 'right');
      const loopX = Math.max(start, end) + loopWidth;
      const height = loopHeights[i]!;
      const box = label === undefined ? undefined : { x: loopX + 6, y: Math.round(y + (height - label.height) / 2), ...label };
      routes[message.path] = { points: [{ x: start, y }, { x: loopX, y }, { x: loopX, y: y + height }, { x: end, y: y + height }], ...(box !== undefined && { label: box }) };
      rightmost = Math.max(rightmost, box === undefined ? loopX : box.x + box.width);
      return;
    }
    const rightward = lifelineX(message.to) > lifelineX(message.from);
    if (message.kind === 'create' || message.kind === 'destroy') {
      const start = edgeX(message.from, currentLevel(message.from, i, false), rightward ? 'right' : 'left');
      // `create` ends at the edge of the head coming down; `destroy`, at the marker on the line.
      const end = message.kind === 'destroy' ? lifelineX(message.to) : lifelineX(message.to) + (rightward ? -1 : 1) * (measures[column.get(message.to)!]!.width / 2);
      const box = label === undefined ? undefined : { x: Math.round((start + end) / 2 - label.width / 2), y: y - label.height - 2, ...label };
      routes[message.path] = { points: [{ x: start, y }, { x: end, y }], ...(box !== undefined && { label: box }) };
      return;
    }
    const start = edgeX(message.from, currentLevel(message.from, i, false), rightward ? 'right' : 'left');
    const end = edgeX(message.to, currentLevel(message.to, i, true), rightward ? 'left' : 'right');
    const box = label === undefined ? undefined : { x: Math.round((start + end) / 2 - label.width / 2), y: y - label.height - 2, ...label };
    routes[message.path] = { points: [{ x: start, y }, { x: end, y }], ...(box !== undefined && { label: box }) };
  });

  // Frames: they cover the Lifelines of their contents plus padding; each nesting level adds an indent.
  for (const frame of frames) {
    const innerRoutes = contents.get(frame.ruta) ?? [];
    const xs = [
      ...innerRoutes.flatMap((route) => {
        const r = routes[route];
        return r === undefined ? [] : [...r.points.map((p) => p.x), ...(r.label === undefined ? [] : [r.label.x, r.label.x + r.label.width])];
      }),
      ...(noteEnds.get(frame.ruta) ?? []),
    ];
    const columns = [
      ...innerRoutes.flatMap((route) => {
        const m = messageList[indexOf.get(route)!]!;
        return [lifelineX(m.from), lifelineX(m.to)];
      }),
      ...(refColumns.get(frame.ruta) ?? []),
    ];
    const framePadding = fragmentHPadding + NESTING_INDENT * (levelsBelow.get(frame.ruta) ?? 0);
    const leftmost = Math.min(...xs, ...columns) - framePadding;
    const firstGuard = frame.operands[0]?.guard?.box.width ?? 0;
    const minimum = Math.max(frame.title === undefined ? 0 : frame.title.box.width + 2 * GUARD_SLACK, frame.tab.width) + (firstGuard > 0 ? firstGuard + GUARD_SLACK : 0) + 2 * GUARD_SLACK;
    const width = Math.max(Math.max(...xs, ...columns) + framePadding - leftmost, minimum, ...frame.operands.map((o) => (o.guard?.box.width ?? 0) + 2 * GUARD_SLACK));
    frame.x = Math.round(leftmost);
    frame.width = Math.round(width);
    frame.tab = { ...frame.tab, x: frame.x };
    if (frame.title !== undefined) frame.title = { text: frame.title.text, box: { ...frame.title.box, x: frame.x + GUARD_SLACK } };
    frame.operands.forEach((operand, k) => {
      if (operand.guard === undefined) return;
      const box = k === 0 ? { ...operand.guard.box, x: frame.x + frame.tab.width + GUARD_SLACK } : { ...operand.guard.box, x: frame.x + GUARD_SLACK };
      operand.guard = { text: operand.guard.text, box };
    });
    rightmost = Math.max(rightmost, frame.x + frame.width);
  }
  for (const note of noteList) rightmost = Math.max(rightmost, note.x + note.width);

  const nodes: Record<string, NodeBox> = {};
  const lifelineLines: SequenceGeometry['lifelines'] = {};
  lifelines.forEach((node, i) => {
    const { width } = measures[i]!;
    const box = { x: Math.round(lifelineX(node.id) - width / 2), y: headYOf(node.id), width, height: headHeight };
    const m = leafMetrics(table, node);
    nodes[node.id] = { ...box, slots: placeInBox(m, nodeContent(node, m), width).slots };
    lifelineLines[node.id] = { x: lifelineX(node.id), y1: box.y + headHeight, y2: destroyedAt(node.id) < 0 ? endY + BOTTOM_PADDING : endYOf(node.id), ...(destroyedAt(node.id) >= 0 && { destroyed: true as const }) };
    rightmost = Math.max(rightmost, box.x + width);
  });
  // Each box wraps the heads of its Lifelines down to the end of their lines (outer ones stick out more).
  const foot = endY + BOTTOM_PADDING;
  const groupBoxes: PlacedGroupBox[] = groupList.map((g) => {
    const boxes = g.lifelines.map((id) => nodes[id]!);
    const titleSize = titles.get(g.id)!;
    const leftmost = Math.min(...boxes.map((c) => c.x)) - padding(g.level);
    const width = Math.max(Math.max(...boxes.map((c) => c.x + c.width)) + padding(g.level) - leftmost, titleSize.width + 2 * TITLE_SLACK);
    const top = MARGIN + g.level * titleHeight;
    const bottom = foot + GROUP_V_PADDING * (levels - g.level);
    rightmost = Math.max(rightmost, leftmost + width);
    return { id: g.id, label: g.label, nivel: g.level, x: Math.round(leftmost), y: top, width: Math.round(width), height: bottom - top, title: { x: Math.round(leftmost) + TITLE_SLACK, y: top + TITLE_SLACK / 2, ...titleSize } };
  });
  const hasContent = lifelines.length > 0;
  return {
    kind: 'secuencia',
    nodes,
    lifelines: lifelineLines,
    activations: activationBoxes,
    messages: routes,
    fragments: frames,
    notes: noteList,
    groups: groupBoxes,
    width: hasContent ? rightmost + MARGIN : 2 * MARGIN,
    height: hasContent ? foot + GROUP_V_PADDING * levels + MARGIN : 2 * MARGIN,
  };
}
