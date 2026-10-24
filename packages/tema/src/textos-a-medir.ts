/**
 * Que textos necesita medir el layout: los mismos que `colocarNodo` y
 * `tamanoDeEtiqueta` miden, con la misma familia y tamano, para que el visor
 * entregue exactamente las claves que se consultaran.
 */
import type { VistaResuelta } from 'canonico';

import { claveDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { contenidoDeNodo, metricasDeHoja } from './metricas';
import type { TablaDeMetricas } from './metricas';
import { textosDeNodo } from './slots';

export function textosAMedir(vista: Pick<VistaResuelta, 'nodes' | 'edges'>, tabla: TablaDeMetricas): TextoAMedir[] {
  const vistos = new Map<string, TextoAMedir>();
  const anadir = (familia: string, tamano: number, texto: string): void => {
    const clave = claveDeTexto(familia, tamano, texto);
    if (!vistos.has(clave)) vistos.set(clave, { familia, tamano, texto });
  };
  for (const nodo of vista.nodes) {
    // Un Grupo abierto mide su cabecera; un Nodo hoja o Grupo colapsado, sus Slots.
    const m = nodo.children.length > 0 ? tabla.grupoAbierto : metricasDeHoja(tabla, nodo);
    for (const { familia, tamano, texto } of textosDeNodo(m, contenidoDeNodo(nodo, m))) anadir(familia, tamano, texto);
  }
  const e = tabla.etiqueta;
  for (const arista of vista.edges) if (arista.label !== undefined) anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, arista.label);
  return [...vistos.values()];
}
