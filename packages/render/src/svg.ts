/**
 * Dibujo de una Vista como cadena SVG. Pura: sin reloj, sin estado, sin DOM;
 * la misma entrada da los mismos bytes.
 */
import { tamanoDeTexto } from 'canonico';
import type { NodoResuelto, Tema, VistaResuelta } from 'canonico';
import type { CajaDeNodo, Geometria } from 'layout';

export interface EntradaDeRender {
  /** Vista resuelta: lo que se dibuja (jerarquia, label, color, colapso). */
  view: VistaResuelta;
  /** Salida de `layoutView` para esa misma Vista. */
  geometry: Geometria;
  theme: Tema;
  /** Tamano del SVG en px; el contenido escala al `viewBox` de la geometria. */
  width: number;
  height: number;
}

const RADIO = 6;

/**
 * Dibuja Nodos y Grupos con los tokens del Tema. Un color es siempre un nombre
 * de Paleta resuelto contra `theme.palette`; sin color, o con un nombre que el
 * Tema no tiene, se usa el token `border`. Lanza si un Nodo de la Vista no
 * esta en la geometria (geometria de otra Vista).
 */
export function renderToSvgString({ view, geometry, theme, width, height }: EntradaDeRender): string {
  const anidados = new Set(view.nodes.flatMap((nodo) => nodo.children.map((hijo) => hijo.id)));
  const contexto: Contexto = { geometry, theme, fontSize: tamanoDeTexto(theme) };
  const raices = view.nodes.filter((nodo) => !anidados.has(nodo.id));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(geometry.width)} ${num(geometry.height)}">`,
    `<rect width="${num(geometry.width)}" height="${num(geometry.height)}" fill="${theme.tokens['background'] ?? 'none'}"/>`,
    ...raices.map((nodo) => dibujarNodo(nodo, contexto)),
    '</svg>',
  ].join('\n');
}

interface Contexto {
  geometry: Geometria;
  theme: Tema;
  fontSize: number;
}

function dibujarNodo(nodo: NodoResuelto, contexto: Contexto): string {
  const caja = contexto.geometry.nodes[nodo.id];
  if (caja === undefined) throw new Error(`El Nodo '${nodo.id}' no esta en la geometria`);
  const { theme } = contexto;
  const esGrupo = nodo.children.length > 0;
  const trazo = (nodo.color !== undefined ? theme.palette[nodo.color] : undefined) ?? theme.tokens['border'] ?? 'none';
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;

  return [
    `<g data-id="${xml(nodo.id)}" transform="translate(${num(caja.x)} ${num(caja.y)})">`,
    `<rect width="${num(caja.width)}" height="${num(caja.height)}" rx="${RADIO}" fill="${theme.tokens['background'] ?? 'none'}" stroke="${trazo}"${nodo.collapsed ? ' stroke-dasharray="6 3"' : ''}/>`,
    etiqueta(texto, caja, esGrupo, contexto),
    ...nodo.children.map((hijo) => dibujarNodo(hijo, contexto)),
    '</g>',
  ].join('\n');
}

/** Un Grupo abierto lleva el titulo arriba a la izquierda; el resto, centrado. */
function etiqueta(texto: string, caja: CajaDeNodo, esGrupo: boolean, { theme, fontSize }: Contexto): string {
  const atributos = esGrupo
    ? `x="${num(10)}" y="${num(fontSize + 8)}"`
    : `x="${num(caja.width / 2)}" y="${num(caja.height / 2)}" text-anchor="middle" dominant-baseline="central"`;
  return `<text ${atributos} font-family="${xml(theme.fonts['body'] ?? 'sans-serif')}" font-size="${num(fontSize)}" fill="${theme.tokens['foreground'] ?? 'currentColor'}">${xml(texto)}</text>`;
}

/** Numero estable: a lo sumo dos decimales, sin ceros sobrantes. */
function num(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}

function xml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
