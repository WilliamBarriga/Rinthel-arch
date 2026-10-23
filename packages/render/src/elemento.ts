/**
 * Elemento de la escena (HTML o SVG) y sus ayudantes. Lo comparten la escena, los
 * pintores y la hoja de estilo; ninguno depende de los otros.
 */

import type { ComponenteDeTema, PropsDeCodigo } from './codigo';

/** Elemento HTML o SVG: atributos, y como contenido hijos, texto o marcado inline (iconos, hoja de estilo). */
export interface Elemento {
  tag: string;
  attrs: Record<string, string>;
  hijos?: (Elemento | string)[];
  /** Marcado ya saneado que va dentro del elemento (el icono, la hoja de estilo). */
  html?: string;
  alClic?: () => void;
  /** Componente de Tema (Capa `code`) que se monta dentro del elemento, con sus props de solo lectura. */
  componente?: { tipo: ComponenteDeTema; props: PropsDeCodigo };
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

/** FNV-1a de 32 bits, en base 36: identificador corto y estable del contenido. */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}
