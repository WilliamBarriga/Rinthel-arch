/**
 * Elemento de la escena (HTML o SVG) y sus ayudantes. Lo comparten la escena, los
 * pintores y la hoja de estilo; ninguno depende de los otros.
 */

/** Elemento HTML o SVG: atributos, y como contenido hijos, texto o marcado inline (iconos, hoja de estilo). */
export interface Elemento {
  tag: string;
  attrs: Record<string, string>;
  hijos?: (Elemento | string)[];
  /** Marcado ya saneado que va dentro del elemento (el icono, la hoja de estilo). */
  html?: string;
  alClic?: () => void;
}

/** Numero estable: a lo sumo dos decimales, sin ceros sobrantes. */
export function num(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}

/**
 * Valor CSS apto para una hoja de estilo o un `style` en linea: sin los
 * caracteres que cerrarian la declaracion, la regla o el elemento `<style>`.
 * Colores y fuentes llegan del Tema, que es entrada ajena.
 */
export function limpiarValorCss(valor: string): string {
  return valor.replace(/[<>{};\\\n\r]/g, '');
}
