/**
 * Texto del disco en el buffer: la anotacion `desdeElDisco` marca las transacciones que lo traen (no se guardan) y la
 * extension `marcasDelDisco()` resalta con `ui-linea-del-disco` las lineas que tocaron, hasta `limpiarMarcasDelDisco`.
 * Las marcas se mapean con lo que se teclee despues.
 */
import { Annotation, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

/** Seam: `vista.dispatch({ changes, annotations: desdeElDisco.of(true) })`. */
export const desdeElDisco = Annotation.define<boolean>();

export const limpiarMarcasDelDisco = StateEffect.define<null>();

const marca = Decoration.line({ class: 'ui-linea-del-disco' });

const marcas = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(previas, tr) {
    if (tr.effects.some((e) => e.is(limpiarMarcasDelDisco))) return Decoration.none;
    const mapeadas = previas.map(tr.changes);
    if (tr.annotation(desdeElDisco) !== true) return mapeadas;
    const nuevas: Range<Decoration>[] = [];
    const doc = tr.state.doc;
    tr.changes.iterChangedRanges((_desde, _hasta, desdeB, hastaB) => {
      // Una insercion que acaba en un salto de linea no toca la linea siguiente.
      const fin = hastaB > desdeB && doc.lineAt(hastaB).from === hastaB ? hastaB - 1 : hastaB;
      for (let n = doc.lineAt(desdeB).number; n <= doc.lineAt(fin).number; n++) nuevas.push(marca.range(doc.line(n).from));
    });
    return mapeadas.update({ add: nuevas, sort: true, filter: (desde) => !nuevas.some((r) => r.from === desde) });
  },
  provide: (campo) => EditorView.decorations.from(campo),
});

export const marcasDelDisco = (): Extension => marcas;
