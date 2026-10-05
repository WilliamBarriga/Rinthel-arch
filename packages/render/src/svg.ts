/**
 * Dibujo de una Vista como cadena SVG. Pura: sin reloj, sin estado, sin DOM;
 * la misma entrada da los mismos bytes.
 */
import { construirEscena } from './escena';
import type { Elemento, EntradaDeEscena } from './escena';

/** Fuente que el export lleva dentro: nombre de familia y archivo en base64. */
export interface FuenteIncrustada {
  family: string;
  /** Tipo MIME del archivo, p. ej. `font/woff2`. */
  mime: string;
  /** Contenido del archivo de fuente en base64. */
  data: string;
}

/** Lo que se necesita para exportar una Vista: sin interaccion (`onSelect`, `onToggle`). */
export type EntradaDeRender = Omit<EntradaDeEscena, 'onSelect' | 'onToggle'> & {
  /** Fuentes del Tema a incrustar como `@font-face` con data URI (SVG autocontenido). */
  fonts?: readonly FuenteIncrustada[];
};

/** Dibuja la escena de la Vista (ver `construirEscena`) como cadena SVG. */
export function renderToSvgString({ fonts = [], ...entrada }: EntradaDeRender): string {
  const escena = construirEscena(entrada);
  if (fonts.length === 0) return aCadena(escena);
  const estilo: Elemento = { tag: 'style', attrs: {}, hijos: [fonts.map(fontFace).join('\n')] };
  return aCadena({ ...escena, hijos: [estilo, ...(escena.hijos ?? [])] });
}

function fontFace({ family, mime, data }: FuenteIncrustada): string {
  return `@font-face{font-family:'${family.replace(/['\\]/g, '\\$&')}';src:url(data:${mime};base64,${data})}`;
}

/** Un elemento por linea; uno solo con texto, en una. */
function aCadena({ tag, attrs, hijos, html }: Elemento): string {
  const atributos = Object.entries(attrs)
    .map(([nombre, valor]) => ` ${nombre}="${escaparXml(valor)}"`)
    .join('');
  const abre = `<${tag}${atributos}`;
  if (html !== undefined) return `${abre}>\n${html}\n</${tag}>`;
  if (hijos === undefined || hijos.length === 0) return `${abre}/>`;
  if (hijos.every((hijo) => typeof hijo === 'string')) return `${abre}>${hijos.map((h) => escaparXml(h as string)).join('')}</${tag}>`;
  const cuerpo = hijos.map((hijo) => (typeof hijo === 'string' ? escaparXml(hijo) : aCadena(hijo)));
  return `${abre}>\n${cuerpo.join('\n')}\n</${tag}>`;
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
