/**
 * Escena de una Vista: el arbol de elementos SVG que `renderToSvgString` y el
 * componente `Diagram` dibujan por igual. Pura: sin reloj, sin estado, sin DOM;
 * la misma entrada da el mismo arbol. Los valores de atributo van sin escapar:
 * cada salida (cadena o React) escapa a su manera.
 */
import { idDeArista, tamanoDeTexto } from 'canonico';
import type { AristaResuelta, IconProvider, NodoResuelto, Tema, VistaResuelta, Visibilidad } from 'canonico';
import { ESCALA_ETIQUETA, alturasDeNodo, indiceDeGeometria, atributosVisibles, textoDeAtributo, yDeFila } from 'layout';
import type { CajaDeNodo, Geometria } from 'layout';

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

/** Ventana visible del lienzo, en unidades de la geometria. */
export interface Camara {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Nivel de detalle del texto: `etiqueta` y `titulo` dibujan la etiqueta del Nodo
 * en la Vista (el `label` del override o, si no hay, su titulo; el override se
 * respeta en todos los niveles) y `completo` anade los Atributos. Solo cambia el texto: las
 * cajas, rutas y el viewBox son identicos en los tres.
 */
export type NivelDeDetalle = 'etiqueta' | 'titulo' | 'completo';

export interface EntradaDeEscena {
  view: VistaResuelta;
  geometry: Geometria;
  theme: Tema;
  icons?: IconProvider;
  width: number;
  height: number;
  /** Visibilidad 0..1 de Nodos y Aristas; sin ella, todo vale 1. */
  visibility?: Visibilidad;
  camera?: Camara;
  /** Nivel de detalle del texto; sin el, etiqueta de la Vista y Atributos (como `completo` pero con la etiqueta). */
  detail?: NivelDeDetalle;
  onSelect?: (id: string) => void;
  /** Con ella, cada Grupo (o Grupo colapsado sin enlace) lleva un control de colapso. */
  onToggle?: (id: string) => void;
}

const RADIO = 6;
/** Margen entre el icono y el borde del Nodo. */
const MARGEN_ICONO = 6;
/** Margen entre la cardinalidad y el punto del extremo. */
const SEPARACION_CARDINALIDAD = 8;
/** Cuanto se sube la cardinalidad de un segmento horizontal para no pisar la linea. */
const ELEVACION_CARDINALIDAD = 4;
/** Tamano de la cardinalidad respecto al del texto del Tema. */
const ESCALA_CARDINALIDAD = 0.8;
/** Tamano del texto de los Atributos respecto al del Tema. */
const ESCALA_ATRIBUTO = 0.85;

interface Contexto extends EntradaDeEscena {
  visibility: Visibilidad;
  fontSize: number;
  /** Alto de la cabecera (el de `layout`). */
  cabecera: number;
}

/**
 * Construye la escena. Nodos y Grupos con los tokens del Tema (un color es siempre
 * un nombre de Paleta resuelto contra `theme.palette`; sin color, o con un nombre
 * que el Tema no tiene, se usa el token `border`), y encima las Aristas. Lanza si
 * un Nodo de la Vista no esta en la geometria (geometria de otra Vista).
 */
export function construirEscena(entrada: EntradaDeEscena): Elemento {
  const { view, geometry, theme, width, height, camera } = entrada;
  const contexto: Contexto = {
    ...entrada,
    visibility: entrada.visibility ?? (() => 1),
    fontSize: tamanoDeTexto(theme),
    cabecera: alturasDeNodo(theme).cabecera,
  };
  const { raices } = indiceDeGeometria(view, geometry);
  const vista = camera ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };

  return {
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      width: num(width),
      height: num(height),
      viewBox: `${num(vista.x)} ${num(vista.y)} ${num(vista.width)} ${num(vista.height)}`,
    },
    hijos: [
      { tag: 'rect', attrs: { width: num(geometry.width), height: num(geometry.height), fill: theme.tokens['background'] ?? 'none' } },
      flecha(colorDeLinea(theme)),
      ...raices.map((nodo) => nodoSvg(nodo, contexto)),
      ...view.edges.flatMap((arista) => aristaSvg(arista, contexto)),
    ],
  };
}

function nodoSvg(nodo: NodoResuelto, contexto: Contexto): Elemento {
  const caja = contexto.geometry.nodes[nodo.id];
  if (caja === undefined) throw new Error(`El Nodo '${nodo.id}' no esta en la geometria`);
  const { theme, onSelect } = contexto;
  const esGrupo = nodo.children.length > 0;
  const trazo = colorDeTrazo(nodo, theme);
  // El `label` de la Vista (override o, si no hay, el titulo) manda en todos los niveles.
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;
  const rect: Elemento = {
    tag: 'rect',
    attrs: {
      width: num(caja.width),
      height: num(caja.height),
      rx: String(RADIO),
      fill: theme.tokens['background'] ?? 'none',
      stroke: trazo,
      ...(nodo.collapsed && { 'stroke-dasharray': '6 3' }),
    },
  };

  return {
    tag: 'g',
    attrs: { 'data-id': nodo.id, transform: `translate(${num(caja.x)} ${num(caja.y)})` },
    hijos: [
      {
        tag: 'g',
        attrs: { 'data-part': 'nodo', ...opacidad(contexto.visibility(nodo.id)) },
        ...(onSelect !== undefined && { alClic: () => onSelect(nodo.id) }),
        hijos: [
          rect,
          etiqueta(texto, caja, esGrupo, tieneFilas(nodo, contexto.detail), contexto),
          ...icono(nodo, trazo, contexto),
          ...atributos(nodo, caja, trazo, contexto),
          ...control(nodo, caja, contexto),
        ],
      },
      ...nodo.children.map((hijo) => nodoSvg(hijo, contexto)),
    ],
  };
}

function tieneFilas(nodo: NodoResuelto, detail?: NivelDeDetalle): boolean {
  return (detail === undefined || detail === 'completo') && atributosVisibles(nodo).length > 0;
}

/** Un Grupo abierto lleva el titulo arriba a la izquierda; el resto, centrado (en la cabecera si tiene Atributos). */
function etiqueta(texto: string, caja: CajaDeNodo, esGrupo: boolean, conAtributos: boolean, { theme, fontSize, cabecera }: Contexto): Elemento {
  const posicion: Record<string, string> = esGrupo
    ? { x: num(10), y: num(fontSize + 8) }
    : { x: num(caja.width / 2), y: num(conAtributos ? cabecera / 2 : caja.height / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central' };
  return {
    tag: 'text',
    attrs: {
      ...posicion,
      'font-family': theme.fonts['body'] ?? 'sans-serif',
      'font-size': num(fontSize),
      fill: theme.tokens['foreground'] ?? 'currentColor',
    },
    hijos: [texto],
  };
}

/**
 * Icono del Tipo de nodo, inline en la esquina de la cabecera. Solo se
 * incrusta si pasa `sanearIcono`.
 */
function icono(nodo: NodoResuelto, trazo: string, { icons, fontSize }: Contexto): Elemento[] {
  const crudo = nodo.icon === undefined ? undefined : icons?.resolve(nodo.icon);
  const svg = crudo === undefined ? undefined : sanearIcono(crudo);
  if (nodo.icon === undefined || svg === undefined) return [];
  const lado = num(fontSize);
  const dimensionado = svg.replace(/<svg\b([^>]*)>/, (_, atributos: string) => {
    const sinMedidas = atributos.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, '');
    return `<svg width="${lado}" height="${lado}"${sinMedidas}>`;
  });
  return [{ tag: 'g', attrs: { 'data-icon': nodo.icon, transform: `translate(${MARGEN_ICONO} ${MARGEN_ICONO})`, color: trazo }, html: dimensionado }];
}

const ETIQUETAS_DE_ICONO = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const ATRIBUTOS_DE_ICONO = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'clip-rule', 'opacity',
  'fill-opacity', 'stroke-opacity',
]);
const ETIQUETA_SVG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>/g;
const ATRIBUTO_SVG = /\s+([\w:-]+)\s*=\s*"([^"]*)"/g;

/**
 * Saneado del icono por lista blanca: solo etiquetas de forma y atributos de
 * dibujo, entre comillas dobles, sin `url(`; sin texto suelto, sin `id` ni
 * referencias. Quita el prologo XML y los comentarios. Devuelve `undefined` si
 * hay algo fuera de la lista: el icono viene de fuera (Workspace) y el SVG
 * exportado debe ser autocontenido.
 */
function sanearIcono(svg: string): string | undefined {
  const limpio = svg.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (limpio.replace(ETIQUETA_SVG, '').trim() !== '') return undefined;
  for (const [, , nombre = '', atributos = ''] of limpio.matchAll(ETIQUETA_SVG)) {
    if (!ETIQUETAS_DE_ICONO.has(nombre)) return undefined;
    for (const [, atributo = '', valor = ''] of atributos.matchAll(ATRIBUTO_SVG)) {
      if (!ATRIBUTOS_DE_ICONO.has(atributo) || /url\(|javascript:|&/i.test(valor)) return undefined;
    }
  }
  return /^<svg[\s>]/.test(limpio) ? limpio : undefined;
}

/** Separador bajo la cabecera y una fila de texto por Atributo, en orden. */
function atributos(nodo: NodoResuelto, caja: CajaDeNodo, trazo: string, { theme, fontSize, cabecera, detail }: Contexto): Elemento[] {
  if (!tieneFilas(nodo, detail)) return [];
  return [
    { tag: 'line', attrs: { x1: '0', y1: num(cabecera), x2: num(caja.width), y2: num(cabecera), stroke: trazo } },
    ...atributosVisibles(nodo).map((atributo, i) => ({
      tag: 'text',
      attrs: {
        'data-attribute': `${nodo.id}#${atributo.name}`,
        x: num(10),
        y: num(yDeFila(theme, i)),
        'dominant-baseline': 'central',
        'font-family': theme.fonts['mono'] ?? 'monospace',
        'font-size': num(fontSize * ESCALA_ATRIBUTO),
        fill: theme.tokens['foreground'] ?? 'currentColor',
      },
      hijos: [textoDeAtributo(atributo)],
    })),
  ];
}

/** Control de colapso de un Grupo (o de un Grupo colapsado sin enlace): solo si el llamador atiende `onToggle`. */
function control(nodo: NodoResuelto, caja: CajaDeNodo, { onToggle, theme, fontSize }: Contexto): Elemento[] {
  const conmutable = nodo.children.length > 0 || (nodo.collapsed && nodo.link === undefined);
  if (onToggle === undefined || !conmutable) return [];
  return [
    {
      tag: 'g',
      attrs: { 'data-toggle': nodo.id },
      alClic: () => onToggle(nodo.id),
      hijos: [
        {
          tag: 'text',
          attrs: {
            x: num(caja.width - 12),
            y: num(fontSize + 8),
            'text-anchor': 'middle',
            'font-family': theme.fonts['mono'] ?? 'monospace',
            'font-size': num(fontSize),
            fill: theme.tokens['foreground'] ?? 'currentColor',
          },
          hijos: [nodo.collapsed ? '+' : '-'],
        },
      ],
    },
  ];
}

/** Valor de la Paleta del Tema para el color del Nodo; sin color, o desconocido, el token `border`. */
function colorDeTrazo(nodo: NodoResuelto, theme: Tema): string {
  return (nodo.color !== undefined ? theme.palette[nodo.color] : undefined) ?? theme.tokens['border'] ?? 'none';
}

/** Color de Aristas y flechas: el token `border` del Tema. */
function colorDeLinea(theme: Tema): string {
  return theme.tokens['border'] ?? 'none';
}

/** Id del marcador de flecha: lleva el color, asi dos Diagram con el mismo Tema comparten una definicion identica y con otro Tema no se pisan. */
function idDeFlecha(color: string): string {
  return `flecha-${color.replace(/[^\w]/g, '')}`;
}

function flecha(color: string): Elemento {
  return {
    tag: 'defs',
    attrs: {},
    hijos: [
      {
        tag: 'marker',
        attrs: { id: idDeFlecha(color), viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto' },
        hijos: [{ tag: 'path', attrs: { d: 'M 0 0 L 10 5 L 0 10 z', fill: color } }],
      },
    ],
  };
}

/**
 * Arista como ruta ortogonal con flecha en el destino. Una Arista sin ruta en la
 * geometria (ELK no la enruto) se omite. La cardinalidad de cada extremo va junto
 * a su puerto, desplazada hacia fuera del Nodo.
 */
function aristaSvg(arista: AristaResuelta, contexto: Contexto): Elemento[] {
  const { geometry, theme, fontSize, onSelect } = contexto;
  const id = idDeArista(arista);
  const puntos = geometry.edges[id]?.points;
  if (puntos === undefined || puntos.length < 2) return [];
  const trazo = puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ');
  const extremos = [
    ['from', arista.fromCardinality, puntos[0]!, puntos[1]!],
    ['to', arista.toCardinality, puntos[puntos.length - 1]!, puntos[puntos.length - 2]!],
  ] as const;
  const cardinalidades: Elemento[] = [];
  for (const [lado, texto, extremo, vecino] of extremos) {
    if (texto === undefined) continue;
    // Se aparta del puerto en la direccion del segmento (hacia dentro de la ruta) y se sube un poco.
    const dx = Math.sign(vecino.x - extremo.x);
    const dy = Math.sign(vecino.y - extremo.y);
    cardinalidades.push({
      tag: 'text',
      attrs: {
        'data-cardinality': `${id}:${lado}`,
        x: num(extremo.x + dx * SEPARACION_CARDINALIDAD),
        y: num(extremo.y + dy * SEPARACION_CARDINALIDAD - (dy === 0 ? ELEVACION_CARDINALIDAD : 0)),
        'font-family': theme.fonts['body'] ?? 'sans-serif',
        'font-size': num(fontSize * ESCALA_CARDINALIDAD),
        fill: theme.tokens['foreground'] ?? 'currentColor',
      },
      hijos: [texto],
    });
  }
  const etiqueta = arista.label === undefined ? [] : [etiquetaSvg(id, arista.label, puntos, geometry.labels[id], contexto)];
  return [
    {
      tag: 'g',
      attrs: { 'data-edge': id, ...opacidad(contexto.visibility(id)) },
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
      hijos: [
        { tag: 'path', attrs: { d: trazo, fill: 'none', stroke: colorDeLinea(theme), 'marker-end': `url(#${idDeFlecha(colorDeLinea(theme))})` } },
        ...cardinalidades,
        ...etiqueta,
      ],
    },
  ];
}

/**
 * Etiqueta de una Arista centrada en la caja que ELK le reservo; sin caja (la
 * Arista se re-enruto por un Pin) va sobre el punto medio del segmento mas largo
 * de la ruta. Lleva un halo del color de fondo para leerse sobre las lineas.
 */
function etiquetaSvg(id: string, texto: string, puntos: readonly { x: number; y: number }[], caja: CajaDeNodo | undefined, contexto: Contexto): Elemento {
  const { theme, fontSize } = contexto;
  const tamano = fontSize * ESCALA_ETIQUETA;
  let centro = { x: 0, y: 0 };
  if (caja !== undefined) {
    centro = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 + tamano * 0.35 };
  } else {
    let mejor = -1;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1]!;
      const b = puntos[i]!;
      const largo = Math.hypot(b.x - a.x, b.y - a.y);
      if (largo > mejor) {
        mejor = largo;
        centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4 };
      }
    }
  }
  return {
    tag: 'text',
    attrs: {
      'data-edge-label': id,
      x: num(centro.x),
      y: num(centro.y),
      'text-anchor': 'middle',
      'font-family': theme.fonts['body'] ?? 'sans-serif',
      'font-size': num(tamano),
      fill: theme.tokens['foreground'] ?? 'currentColor',
      stroke: theme.tokens['background'] ?? 'none',
      'stroke-width': '3',
      'paint-order': 'stroke',
    },
    hijos: [texto],
  };
}

/** `opacity` solo si no es 1, acotada a [0, 1]; un NaN cuenta como 0. Con 0 no recibe clics. */
function opacidad(visibilidad: number): Record<string, string> {
  const valor = Number.isNaN(visibilidad) ? 0 : Math.min(Math.max(visibilidad, 0), 1);
  if (valor === 1) return {};
  return valor === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(valor) };
}

/** Numero estable: a lo sumo dos decimales, sin ceros sobrantes. */
function num(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}
