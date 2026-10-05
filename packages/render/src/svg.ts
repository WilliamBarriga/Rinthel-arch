/**
 * Dibujo de una Vista como cadena SVG. Pura: sin reloj, sin estado, sin DOM;
 * la misma entrada da los mismos bytes.
 */
import { idDeArista, tamanoDeTexto } from 'canonico';
import type { AristaResuelta, NodoResuelto, Tema, VistaResuelta } from 'canonico';
import type { CajaDeNodo, Geometria, RutaDeArista } from 'layout';

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
 * Dibuja Nodos, Grupos y Aristas con los tokens del Tema. Un color es siempre un nombre
 * de Paleta resuelto contra `theme.palette`; sin color, o con un nombre que el
 * Tema no tiene, se usa el token `border`. Lanza si un Nodo de la Vista no
 * esta en la geometria (geometria de otra Vista).
 */
export function renderToSvgString({ view, geometry, theme, width, height }: EntradaDeRender): string {
  const anidados = new Set(view.nodes.flatMap((nodo) => nodo.children.map((hijo) => hijo.id)));
  const fondo = escaparXml(theme.tokens['background'] ?? 'none');
  const contexto: Contexto = { geometry, theme, fontSize: tamanoDeTexto(theme) };
  const raices = view.nodes.filter((nodo) => !anidados.has(nodo.id));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${numEstable(width)}" height="${numEstable(height)}" viewBox="0 0 ${numEstable(geometry.width)} ${numEstable(geometry.height)}">`,
    `<rect width="${numEstable(geometry.width)}" height="${numEstable(geometry.height)}" fill="${fondo}"/>`,
    flecha(colorDeLinea(theme)),
    ...raices.map((nodo) => dibujarNodo(nodo, contexto)),
    ...view.edges.map((arista) => dibujarArista(arista, contexto)),
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
  const trazo = escaparXml(colorDeTrazo(nodo, theme));
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;

  return [
    `<g data-id="${escaparXml(nodo.id)}" transform="translate(${numEstable(caja.x)} ${numEstable(caja.y)})">`,
    `<rect width="${numEstable(caja.width)}" height="${numEstable(caja.height)}" rx="${RADIO}" fill="${escaparXml(theme.tokens['background'] ?? 'none')}" stroke="${trazo}"${nodo.collapsed ? ' stroke-dasharray="6 3"' : ''}/>`,
    etiqueta(texto, caja, esGrupo, contexto),
    ...nodo.children.map((hijo) => dibujarNodo(hijo, contexto)),
    '</g>',
  ].join('\n');
}

/** Color de Aristas y flechas: el token `border` del Tema. */
function colorDeLinea(theme: Tema): string {
  return escaparXml(theme.tokens['border'] ?? 'none');
}

function flecha(color: string): string {
  return `<defs><marker id="flecha" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker></defs>`;
}

/** Margen entre la cardinalidad y el punto del extremo. */
const SEPARACION_CARDINALIDAD = 8;
/** Cuanto se sube la cardinalidad de un segmento horizontal para no pisar la linea. */
const ELEVACION_CARDINALIDAD = 4;
/** Tamano de la cardinalidad respecto al del texto del Tema. */
const ESCALA_CARDINALIDAD = 0.8;

/**
 * Arista como ruta ortogonal con flecha en el destino. Una Arista sin ruta en la
 * geometria (ELK no la enruto) se omite. La cardinalidad de cada extremo va junto
 * a su puerto, desplazada hacia fuera del Nodo.
 */
function dibujarArista(arista: AristaResuelta, { geometry, theme, fontSize }: Contexto): string {
  const id = idDeArista(arista);
  const ruta: RutaDeArista | undefined = geometry.edges[id];
  if (ruta === undefined || ruta.points.length < 2) return '';
  const puntos = ruta.points;
  const trazo = puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${numEstable(x)} ${numEstable(y)}`).join(' ');
  const lineas = [
    `<path data-edge="${escaparXml(id)}" d="${trazo}" fill="none" stroke="${colorDeLinea(theme)}" marker-end="url(#flecha)"/>`,
  ];
  const extremos = [
    ['from', arista.fromCardinality, puntos[0]!, puntos[1]!],
    ['to', arista.toCardinality, puntos[puntos.length - 1]!, puntos[puntos.length - 2]!],
  ] as const;
  for (const [lado, texto, extremo, vecino] of extremos) {
    if (texto === undefined) continue;
    // Se aparta del puerto en la direccion del segmento (hacia dentro de la ruta) y se sube un poco.
    const dx = Math.sign(vecino.x - extremo.x);
    const dy = Math.sign(vecino.y - extremo.y);
    const x = extremo.x + dx * SEPARACION_CARDINALIDAD;
    const y = extremo.y + dy * SEPARACION_CARDINALIDAD - (dy === 0 ? ELEVACION_CARDINALIDAD : 0);
    lineas.push(
      `<text data-cardinality="${escaparXml(id)}:${lado}" x="${numEstable(x)}" y="${numEstable(y)}" font-family="${escaparXml(theme.fonts['body'] ?? 'sans-serif')}" font-size="${numEstable(fontSize * ESCALA_CARDINALIDAD)}" fill="${escaparXml(theme.tokens['foreground'] ?? 'currentColor')}">${escaparXml(texto)}</text>`,
    );
  }
  return lineas.join('\n');
}

/** Valor de la Paleta del Tema para el color del Nodo; sin color, o desconocido, el token `border`. */
function colorDeTrazo(nodo: NodoResuelto, theme: Tema): string {
  return (nodo.color !== undefined ? theme.palette[nodo.color] : undefined) ?? theme.tokens['border'] ?? 'none';
}

/** Un Grupo abierto lleva el titulo arriba a la izquierda; el resto, centrado. */
function etiqueta(texto: string, caja: CajaDeNodo, esGrupo: boolean, { theme, fontSize }: Contexto): string {
  const atributos = esGrupo
    ? `x="${numEstable(10)}" y="${numEstable(fontSize + 8)}"`
    : `x="${numEstable(caja.width / 2)}" y="${numEstable(caja.height / 2)}" text-anchor="middle" dominant-baseline="central"`;
  return `<text ${atributos} font-family="${escaparXml(theme.fonts['body'] ?? 'sans-serif')}" font-size="${numEstable(fontSize)}" fill="${escaparXml(theme.tokens['foreground'] ?? 'currentColor')}">${escaparXml(texto)}</text>`;
}

/** Numero estable: a lo sumo dos decimales, sin ceros sobrantes. */
function numEstable(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
