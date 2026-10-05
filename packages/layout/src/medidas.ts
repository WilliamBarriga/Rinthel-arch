/**
 * Tamano de los Nodos a partir del Tema. Sin medir texto real (el layout corre
 * en Node y en Worker, sin DOM): se estima el ancho por caracter segun el
 * tamano y la familia de la fuente del Tema.
 */
import { tamanoDeTexto } from 'canonico';
import type { Atributo, Tema } from 'canonico';

const ANCHO_MINIMO = 120;
const PADDING_HORIZONTAL = 32;
const ALTO_POR_LINEA = 3.4;
const ALTO_POR_FILA = 1.8;

/** Lo que del Tema afecta al layout: las fuentes y el tamano de texto. */
export interface MedidasDeTexto {
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Familias del Tema; solo para la clave de layout. */
  fuentes: Record<string, string>;
}

export function medidasDeTexto(tema: Tema): MedidasDeTexto {
  const proporcional = !/mono/i.test(tema.fonts['body'] ?? '');
  return {
    fontSize: tamanoDeTexto(tema),
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: tema.fonts,
  };
}

/** Alto de la cabecera (titulo) y de cada fila de Atributo de un Nodo; `render` dibuja con las mismas. */
export function alturasDeNodo(tema: Tema): { cabecera: number; fila: number } {
  return alturasDe(medidasDeTexto(tema));
}

function alturasDe(medidas: MedidasDeTexto): { cabecera: number; fila: number } {
  return { cabecera: Math.ceil(medidas.fontSize * ALTO_POR_LINEA), fila: Math.ceil(medidas.fontSize * ALTO_POR_FILA) };
}

/** Texto de la fila de un Atributo; `render` escribe lo mismo. */
export function textoDeAtributo(atributo: Atributo): string {
  return `${atributo.name}: ${atributo.type}`;
}

/** Tamano de un Nodo hoja: cabecera con el titulo y una fila por Atributo, en orden. */
export function tamanoDeNodo(
  texto: string,
  medidas: MedidasDeTexto,
  atributos: readonly Atributo[] = [],
): { width: number; height: number } {
  const { cabecera, fila } = alturasDe(medidas);
  const mayor = Math.max(texto.length, ...atributos.map((atributo) => textoDeAtributo(atributo).length));
  return {
    width: Math.max(ANCHO_MINIMO, Math.ceil(mayor * medidas.fontSize * medidas.factorDeAncho + PADDING_HORIZONTAL)),
    height: cabecera + atributos.length * fila,
  };
}
