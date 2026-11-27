/** Texts that layout measures (the same as `placeNode` and `labelSize`, with the same family and size), without repeats. */
import type { ResolvedItem, ResolvedView } from 'canonical';

import { textKey } from './measurement';
import type { TextToMeasure } from './measurement';
import { nodeContent } from './content';
import { noteTextStyle, leafMetrics, noteWords, guardText } from './metrics';
import type { MetricsTable } from './metrics';
import { nodeTexts } from './slots';

export function textsToMeasure(view: ResolvedView, table: MetricsTable): TextToMeasure[] {
  const seen = new Map<string, TextToMeasure>();
  const add = (family: string, size: number, text: string, weight?: number): void => {
    const key = textKey(family, size, text, weight);
    if (!seen.has(key)) seen.set(key, { familia: family, tamano: size, texto: text, ...(weight !== undefined && { peso: weight }) });
  };
  for (const node of view.nodes) {
    const m = node.children.length > 0 ? table.grupoAbierto : leafMetrics(table, node);
    for (const { familia: family, tamano: size, texto: text, peso: weight } of nodeTexts(m, nodeContent(node, m))) add(family, size, text, weight);
  }
  const e = table.etiqueta;
  const fromItems = (items: readonly ResolvedItem[]): void => {
    for (const item of items) {
      if (item.type === 'message') continue;
      if (item.type === 'note') {
        const { familia: family, tamano: size, peso: weight } = noteTextStyle(e);
        for (const word of noteWords(item.text)) add(family, size, word, weight);
        continue;
      }
      if (item.type === 'ref') {
        add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, 'ref', e.pesoDeEtiqueta);
        add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, item.title, e.pesoDeEtiqueta);
        continue;
      }
      add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, item.operator, e.pesoDeEtiqueta);
      for (const operand of item.operands) {
        if (operand.guard !== undefined) add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, guardText(operand.guard), e.pesoDeEtiqueta);
        fromItems(operand.items);
      }
    }
  };
  if (view.type === 'sequence') {
    for (const message of view.interaction.messages) if (message.label !== undefined) add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, message.label, e.pesoDeEtiqueta);
    fromItems(view.interaction.items);
  } else {
    for (const edge of view.edges) if (edge.label !== undefined) add(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, edge.label, e.pesoDeEtiqueta);
  }
  return [...seen.values()];
}
