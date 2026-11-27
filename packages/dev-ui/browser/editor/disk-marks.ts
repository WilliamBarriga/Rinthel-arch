/**
 * Disk text in the buffer: the `fromDisk` annotation marks the transactions that bring it (they are not saved) and the
 * `diskMarks()` extension highlights with `ui-linea-del-disco` the lines they touched, until `clearDiskMarks`.
 * The marks are mapped through whatever is typed afterwards.
 */
import { Annotation, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

/** Seam: `view.dispatch({ changes, annotations: fromDisk.of(true) })`. */
export const fromDisk = Annotation.define<boolean>();

export const clearDiskMarks = StateEffect.define<null>();

const mark = Decoration.line({ class: 'ui-linea-del-disco' });

const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(previous, tr) {
    if (tr.effects.some((e) => e.is(clearDiskMarks))) return Decoration.none;
    const mapped = previous.map(tr.changes);
    if (tr.annotation(fromDisk) !== true) return mapped;
    const fresh: Range<Decoration>[] = [];
    const doc = tr.state.doc;
    tr.changes.iterChangedRanges((_from, _to, fromB, toB) => {
      // An insertion that ends in a line break does not touch the next line.
      const end = toB > fromB && doc.lineAt(toB).from === toB ? toB - 1 : toB;
      for (let n = doc.lineAt(fromB).number; n <= doc.lineAt(end).number; n++) fresh.push(mark.range(doc.line(n).from));
    });
    return mapped.update({ add: fresh, sort: true, filter: (from) => !fresh.some((r) => r.from === from) });
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const diskMarks = (): Extension => marks;
