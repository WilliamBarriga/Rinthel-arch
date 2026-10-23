/**
 * Elemento SVG de la escena y su ayudante numerico. Lo comparten la escena y los
 * pintores; ninguno de los dos depende del otro.
 */

/** Elemento SVG: atributos, y como contenido hijos, texto o marcado inline (iconos). */
export interface Elemento {
  tag: string;
  attrs: Record<string, string>;
  hijos?: (Elemento | string)[];
  /** Marcado SVG ya saneado que va dentro del elemento (el icono). */
  html?: string;
  /** Solo lo usa el componente; la cadena no lleva manejadores. */
  alClic?: () => void;
}

/** Numero estable: a lo sumo dos decimales, sin ceros sobrantes. */
export function num(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}
