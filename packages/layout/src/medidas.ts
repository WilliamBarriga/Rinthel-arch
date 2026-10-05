/**
 * Tamano de los Nodos a partir del Tema. Sin medir texto real (el layout corre
 * en Node y en Worker, sin DOM): se estima el ancho por caracter segun el
 * tamano y la familia de la fuente del Tema.
 */
import type { NodoResuelto, Tema } from 'canonico';

const TAMANO_POR_DEFECTO = 14;
const ANCHO_MINIMO = 120;
const PADDING_HORIZONTAL = 32;
const ALTO_POR_LINEA = 3.4;

/** Lo que del Tema afecta al layout: las fuentes y el tamano de texto. */
export interface MedidasDeTexto {
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Familias del Tema; solo para la clave de layout. */
  fuentes: Record<string, string>;
}

export function medidasDeTexto(tema: Tema): MedidasDeTexto {
  const declarado = Number.parseFloat(tema.tokens['fontSize'] ?? '');
  const proporcional = !/mono/i.test(tema.fonts['body'] ?? '');
  return {
    fontSize: Number.isFinite(declarado) && declarado > 0 ? declarado : TAMANO_POR_DEFECTO,
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: tema.fonts,
  };
}

/** Texto que muestra el Nodo en la Vista: el label del override o su titulo. */
export function textoDelNodo(nodo: Pick<NodoResuelto, 'id' | 'title'>, labels: ReadonlyMap<string, string>): string {
  return labels.get(nodo.id) ?? nodo.title ?? nodo.id;
}

export function tamanoDeNodo(texto: string, medidas: MedidasDeTexto): { width: number; height: number } {
  return {
    width: Math.max(ANCHO_MINIMO, Math.ceil(texto.length * medidas.fontSize * medidas.factorDeAncho + PADDING_HORIZONTAL)),
    height: Math.ceil(medidas.fontSize * ALTO_POR_LINEA),
  };
}
