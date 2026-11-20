/**
 * Cambios minimos del buffer: los `ChangeSet` de CodeMirror acumulados desde el ultimo guardado se traducen a
 * ediciones `{ file, range, replacement }` sobre el texto base (rangos 1-based, fin excluido, como `IssueFix`).
 * Se manda solo lo que cambio, nunca el archivo entero (ADR 0007). Puro.
 */
import { Text } from '@codemirror/state';
import type { ChangeSet } from '@codemirror/state';
import type { PeticionDeEdiciones } from '../../src/protocolo';

export type EdicionDeTexto = PeticionDeEdiciones['ediciones'][number];

const posicion = (doc: Text, offset: number): { line: number; column: number } => {
  const linea = doc.lineAt(offset);
  return { line: linea.number, column: offset - linea.from + 1 };
};

/** `cambios` debe partir de `base` (su `length` es el de `base`). */
export function edicionesDesdeCambios(file: string, base: string, cambios: ChangeSet): EdicionDeTexto[] {
  const doc = Text.of(base.split('\n'));
  const ediciones: EdicionDeTexto[] = [];
  cambios.iterChanges((desde, hasta, _desdeB, _hastaB, insertado) => {
    ediciones.push({ file, range: { start: posicion(doc, desde), end: posicion(doc, hasta) }, replacement: insertado.toString() });
  });
  return ediciones;
}
