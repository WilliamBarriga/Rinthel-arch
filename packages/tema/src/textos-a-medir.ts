/**
 * Que textos necesita medir el layout: los mismos que `colocarNodo` y
 * `tamanoDeEtiqueta` miden, con la misma familia y tamano, para que el visor
 * entregue exactamente las claves que se consultaran.
 */
import type { VistaResuelta } from 'canonico';

import { claveDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { atributosVisibles, metricasDeHoja, muestra } from './metricas';
import type { TablaDeMetricas } from './metricas';
import { textoDeAtributo, textoDeTitulo } from './slots';

export function textosAMedir(vista: Pick<VistaResuelta, 'nodes' | 'edges'>, tabla: TablaDeMetricas): TextoAMedir[] {
  const vistos = new Map<string, TextoAMedir>();
  const anadir = (familia: string, tamano: number, texto: string): void => {
    const clave = claveDeTexto(familia, tamano, texto);
    if (!vistos.has(clave)) vistos.set(clave, { familia, tamano, texto });
  };
  for (const nodo of vista.nodes) {
    const abierto = nodo.children.length > 0;
    const m = abierto ? tabla.grupoAbierto : metricasDeHoja(tabla, nodo);
    if (muestra(m, 'title')) {
      const { texto, tamano } = textoDeTitulo(m, nodo.label);
      anadir(m.fuentes['body']!, tamano, texto);
    }
    if (abierto) continue;
    for (const atributo of atributosVisibles(nodo, m)) anadir(m.fuentes['mono']!, m.fontSize * m.escalaAtributo, textoDeAtributo(atributo));
  }
  const e = tabla.etiqueta;
  for (const arista of vista.edges) if (arista.label !== undefined) anadir(e.fuentes['body']!, e.fontSize * e.escalaEtiqueta, arista.label);
  return [...vistos.values()];
}
