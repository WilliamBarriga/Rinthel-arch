/**
 * Que textos necesita medir el layout: los mismos que `colocarNodo` y
 * `tamanoDeEtiqueta` miden, con la misma familia y tamano, para que el visor
 * entregue exactamente las claves que se consultaran.
 */
import type { VistaResuelta } from 'canonico';

import { claveDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { contenidoDeNodo } from './contenido';
import { metricasDeHoja } from './metricas';
import type { TablaDeMetricas } from './metricas';
import { textosDeNodo } from './slots';

export function textosAMedir(vista: Pick<VistaResuelta, 'nodes' | 'edges'>, tabla: TablaDeMetricas): TextoAMedir[] {
  const vistos = new Map<string, TextoAMedir>();
  const anadir = (familia: string, tamano: number, texto: string, peso?: number): void => {
    const clave = claveDeTexto(familia, tamano, texto, peso);
    if (!vistos.has(clave)) vistos.set(clave, { familia, tamano, texto, ...(peso !== undefined && { peso }) });
  };
  for (const nodo of vista.nodes) {
    // Un Grupo abierto mide su cabecera; un Nodo hoja o Grupo colapsado, sus Slots.
    const m = nodo.children.length > 0 ? tabla.grupoAbierto : metricasDeHoja(tabla, nodo);
    for (const { familia, tamano, texto, peso } of textosDeNodo(m, contenidoDeNodo(nodo, m))) anadir(familia, tamano, texto, peso);
  }
  const e = tabla.etiqueta;
  for (const arista of vista.edges) if (arista.label !== undefined) anadir(e.fuenteDeEtiqueta, e.fontSize * e.escalaEtiqueta, arista.label, e.pesoDeEtiqueta);
  return [...vistos.values()];
}
