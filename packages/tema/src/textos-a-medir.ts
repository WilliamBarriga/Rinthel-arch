/** Textos que el layout mide (los mismos que `colocarNodo` y `tamanoDeEtiqueta`, con la misma familia y tamano), sin repetir. */
import type { ItemResuelto, VistaResuelta } from 'canonico';

import { claveDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { contenidoDeNodo } from './contenido';
import { estiloDeTextoDeNota, metricasDeHoja, palabrasDeNota, textoDeGuarda } from './metricas';
import type { TablaDeMetricas } from './metricas';
import { textosDeNodo } from './slots';

export function textosAMedir(vista: VistaResuelta, tabla: TablaDeMetricas): TextoAMedir[] {
  const vistos = new Map<string, TextoAMedir>();
  const anadir = (familia: string, tamano: number, texto: string, peso?: number): void => {
    const clave = claveDeTexto(familia, tamano, texto, peso);
    if (!vistos.has(clave)) vistos.set(clave, { familia, tamano, texto, ...(peso !== undefined && { peso }) });
  };
  for (const nodo of vista.nodes) {
    const m = nodo.children.length > 0 ? tabla.grupoAbierto : metricasDeHoja(tabla, nodo);
    for (const { familia, tamano, texto, peso } of textosDeNodo(m, contenidoDeNodo(nodo, m))) anadir(familia, tamano, texto, peso);
  }
  const e = tabla.etiqueta;
  const deItems = (items: readonly ItemResuelto[]): void => {
    for (const item of items) {
      if (item.type === 'message') continue;
      if (item.type === 'note') {
        const { familia, tamano, peso } = estiloDeTextoDeNota(e);
        for (const palabra of palabrasDeNota(item.text)) anadir(familia, tamano, palabra, peso);
        continue;
      }
      if (item.type === 'ref') {
        anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, 'ref', e.pesoDeEtiqueta);
        anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, item.title, e.pesoDeEtiqueta);
        continue;
      }
      anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, item.operator, e.pesoDeEtiqueta);
      for (const operando of item.operands) {
        if (operando.guard !== undefined) anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, textoDeGuarda(operando.guard), e.pesoDeEtiqueta);
        deItems(operando.items);
      }
    }
  };
  if (vista.type === 'sequence') {
    for (const mensaje of vista.interaction.messages) if (mensaje.label !== undefined) anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, mensaje.label, e.pesoDeEtiqueta);
    deItems(vista.interaction.items);
  } else {
    for (const arista of vista.edges) if (arista.label !== undefined) anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, arista.label, e.pesoDeEtiqueta);
  }
  return [...vistos.values()];
}
