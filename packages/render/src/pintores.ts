/**
 * Pintores por parte: cada uno dibuja una parte de la Vista leyendo solo del
 * Estilo resuelto, sin tokens ni numeros propios. Nodos y Grupos son HTML (cada
 * Slot en el rectangulo que reservo `layout`; el CSS solo pinta y recorta);
 * Aristas y sus etiquetas son SVG. Puros; la escena los ordena.
 */
import { sanearIcono } from 'canonico';
import type { Atributo, IconProvider, NodoResuelto } from 'canonico';
import type { CajaDeNodo } from 'layout';
import { atributosVisibles, colocarEnCaja, metricasDeHoja, textoDeAtributo } from 'tema';
import type { Metricas, Rect } from 'tema';

import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import { aspectoDeEstado } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';

type Punto = { x: number; y: number };

export interface DatosDeNodo {
  nodo: NodoResuelto;
  caja: CajaDeNodo;
  /** Color de trazo ya resuelto de la Paleta. */
  trazo: string;
  /** Texto de la etiqueta (con el contador si esta colapsado). */
  texto: string;
  icons?: IconProvider;
}

/** `left/top/width/height` en px de un rectangulo (relativo a su caja contenedora). */
function enRect(r: Rect, extra = ''): string {
  return `left:${num(r.x)}px;top:${num(r.y)}px;width:${num(r.width)}px;height:${num(r.height)}px;${extra}`;
}

/** Slot de texto: un `div` absoluto exactamente en su rectangulo; el CSS solo recorta (elipsis). */
function slotDeTexto(nombre: string, clases: string, r: Rect, texto: string): Elemento {
  return { tag: 'div', attrs: { class: `rd-slot ${clases}`, 'data-slot': nombre, style: enRect(r, `line-height:${num(r.height)}px;`) }, hijos: [texto] };
}

/** Altura de la franja de titulo de un Grupo y de su control de colapso (centrada sobre la linea base de las Metricas). */
function altoDeEncabezado(metricas: Metricas): number {
  return Math.round(2 * (metricas.baseDeTitulo - metricas.fontSize * 0.35));
}

/**
 * Contenido de un Nodo (hoja, o Grupo colapsado): Slot `title` centrado, icono y
 * Slot `attrs` con una fila por Atributo. `conAtributos`: si se dibujan las filas.
 */
export function pintarNodo(estilo: Estilo, datos: DatosDeNodo & { conAtributos: boolean }): Elemento[] {
  const { nodo, caja: c, trazo, texto, conAtributos, icons } = datos;
  const metricas = metricasDeHoja(estilo.tabla, nodo);
  const atributos = conAtributos ? atributosVisibles(nodo, metricas) : [];
  const { title, attrs } = colocarEnCaja(metricas, atributos.length, c.width).slots;
  return [
    ...(title === undefined ? [] : [slotDeTexto('title', 'rd-title', title, texto)]),
    ...pintarIcono(estilo, nodo, trazo, icons),
    ...(attrs === undefined || atributos.length === 0 ? [] : [pintarAtributos(estilo, nodo.id, atributos, attrs)]),
  ];
}

/** Contenido de un Grupo abierto: titulo arriba a la izquierda e icono (sus hijos son Nodos de otras capas). */
export function pintarGrupo(estilo: Estilo, datos: DatosDeNodo): Elemento[] {
  const { metricas } = estilo;
  const ancho = Math.max(0, datos.caja.width - metricas.margenDeTexto - 2 * metricas.margenDeControl);
  const encabezado = { x: metricas.margenDeTexto, y: 0, width: ancho, height: altoDeEncabezado(metricas) };
  return [slotDeTexto('title', 'rd-title rd-encabezado', encabezado, datos.texto), ...pintarIcono(estilo, datos.nodo, datos.trazo, datos.icons)];
}

/** Icono del Tipo de nodo, inline en la esquina de la cabecera. Solo se incrusta si pasa `sanearIcono`. */
function pintarIcono(estilo: Estilo, nodo: NodoResuelto, trazo: string, icons?: IconProvider): Elemento[] {
  const { metricas } = estilo;
  const crudo = nodo.icon === undefined ? undefined : icons?.resolve(nodo.icon);
  const svg = crudo === undefined ? undefined : sanearIcono(crudo);
  if (nodo.icon === undefined || svg === undefined) return [];
  const lado = num(metricas.iconoLado);
  const dimensionado = svg.replace(/<svg\b([^>]*)>/, (_, atributos: string) => {
    const sinMedidas = atributos.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, '');
    return `<svg width="${lado}" height="${lado}"${sinMedidas}>`;
  });
  const rect = { x: metricas.margenIcono, y: metricas.margenIcono, width: metricas.iconoLado, height: metricas.iconoLado };
  return [{ tag: 'div', attrs: { class: 'rd-icono', 'data-icon': nodo.icon, style: enRect(rect, `color:${limpiarValorCss(trazo)};`) }, html: dimensionado }];
}

/** Slot `attrs`: una fila de texto por Atributo, en orden, cada una en su rectangulo (relativo al Slot). */
function pintarAtributos(estilo: Estilo, id: string, atributos: readonly Atributo[], zona: Rect): Elemento {
  const { metricas } = estilo;
  return {
    tag: 'div',
    attrs: { class: `rd-slot rd-attrs${zona.y > 0 ? ' rd-separado' : ''}`, 'data-slot': 'attrs', style: enRect(zona) },
    hijos: atributos.map((atributo, i) => ({
      tag: 'div',
      attrs: {
        class: 'rd-fila',
        'data-attribute': `${id}#${atributo.name}`,
        style: enRect({ x: 0, y: i * metricas.fila, width: zona.width, height: metricas.fila }, `line-height:${num(metricas.fila)}px;`),
      },
      hijos: [textoDeAtributo(atributo)],
    })),
  };
}

/** Control de colapso de un Grupo: el glifo del Estilo segun el estado. */
export function pintarControl(estilo: Estilo, { nodo, caja, alClic }: { nodo: NodoResuelto; caja: CajaDeNodo; alClic: () => void }): Elemento {
  const { metricas } = estilo;
  const alto = altoDeEncabezado(metricas);
  const rect = { x: caja.width - 2 * metricas.margenDeControl, y: 0, width: 2 * metricas.margenDeControl, height: alto };
  return {
    tag: 'div',
    attrs: { class: 'rd-control', 'data-toggle': nodo.id, style: enRect(rect, `line-height:${alto}px;`) },
    alClic,
    hijos: [nodo.collapsed ? estilo.glifos.colapsado : estilo.glifos.expandido],
  };
}

/** Id del marcador de flecha: lleva el color, asi dos dibujos con el mismo color comparten una definicion identica y con otro no se pisan. */
function idDeFlecha(color: string): string {
  return `flecha-${color.replace(/[^\w]/g, '')}`;
}

/** Definicion del marcador de flecha del color de las Aristas. */
export function pintarFlecha(estilo: Estilo): Elemento {
  const { flecha } = estilo.arista;
  const colores = [estilo.arista.color];
  return {
    tag: 'defs',
    attrs: {},
    hijos: colores.map((color) => ({
      tag: 'marker',
      attrs: { id: idDeFlecha(color), viewBox: flecha.viewBox, refX: num(flecha.refX), refY: num(flecha.refY), markerWidth: num(flecha.ancho), markerHeight: num(flecha.alto), orient: 'auto' },
      hijos: [{ tag: 'path', attrs: { d: flecha.forma, fill: color } }],
    })),
  };
}

/**
 * Arista: ruta ortogonal con flecha en el destino y la cardinalidad de cada
 * extremo junto a su puerto, desplazada hacia fuera del Nodo. Los hijos extra
 * (la etiqueta) los pone quien llama; `atributos` lleva opacidad e id.
 */
export function pintarArista(
  estilo: Estilo,
  datos: { id: string; puntos: readonly Punto[]; desde?: string; hasta?: string; atributos?: Record<string, string>; extra?: Elemento[]; alClic?: () => void },
): Elemento {
  const { id, puntos, desde, hasta, atributos = {}, extra = [], alClic } = datos;
  const { arista, metricas } = estilo;
  const color = arista.color;
  const ruta = puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ');
  const extremos = [
    ['from', desde, puntos[0]!, puntos[1]!],
    ['to', hasta, puntos[puntos.length - 1]!, puntos[puntos.length - 2]!],
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
        x: num(extremo.x + dx * arista.separacionCardinalidad),
        y: num(extremo.y + dy * arista.separacionCardinalidad - (dy === 0 ? arista.elevacionCardinalidad : 0)),
        'font-family': estilo.fuenteCuerpo,
        'font-size': num(metricas.fontSize * metricas.escalaCardinalidad),
        fill: estilo.texto,
      },
      hijos: [texto],
    });
  }
  return {
    tag: 'g',
    attrs: { 'data-edge': id, ...atributos },
    ...(alClic !== undefined && { alClic }),
    hijos: [
      { tag: 'path', attrs: { d: ruta, fill: 'none', stroke: color, 'marker-end': `url(#${idDeFlecha(color)})` } },
      ...cardinalidades,
      ...extra,
    ],
  };
}

/** Punto de una etiqueta sin caja propia: medio del segmento mas largo de la ruta, subido `elevacionEtiquetaSinCaja`. Compartido con el hit-test del shell. */
export function centroDeEtiquetaSinCaja(estilo: Estilo, puntos: readonly Punto[]): Punto {
  let centro = puntos[0] ?? { x: 0, y: 0 };
  let mejor = -1;
  for (let i = 1; i < puntos.length; i++) {
    const [a, b] = [puntos[i - 1]!, puntos[i]!];
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    if (largo > mejor) {
      mejor = largo;
      centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - estilo.arista.elevacionEtiquetaSinCaja };
    }
  }
  return centro;
}

/**
 * Etiqueta de una Arista centrada en la caja que ELK le reservo; sin caja (la
 * Arista se re-enruto por un Pin) va sobre el punto medio del segmento mas largo
 * de la ruta. Lleva un halo del color de fondo para leerse sobre las lineas.
 */
export function pintarEtiquetaDeArista(
  estilo: Estilo,
  { id, texto, puntos, caja }: { id: string; texto: string; puntos: readonly Punto[]; caja: CajaDeNodo | undefined },
): Elemento {
  const { metricas, etiqueta } = estilo;
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  const centro =
    caja !== undefined
      ? { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 + tamano * etiqueta.centradoVertical }
      : centroDeEtiquetaSinCaja(estilo, puntos);
  return {
    tag: 'text',
    attrs: {
      'data-edge-label': id,
      x: num(centro.x),
      y: num(centro.y),
      'text-anchor': 'middle',
      'font-family': estilo.fuenteCuerpo,
      'font-size': num(tamano),
      fill: estilo.texto,
      stroke: etiqueta.halo.color,
      'stroke-width': num(etiqueta.halo.ancho),
      'paint-order': 'stroke',
    },
    hijos: [texto],
  };
}

/** Contorno de estado alrededor de una caja (Nodo, Grupo) o de una fila de Atributo (`rect`, relativa a la caja del Nodo). Su aspecto lo da la hoja de estilo. */
export function pintarEstadoDeCaja(estado: EstadoVisual, id: string, rect?: Rect): Elemento {
  return {
    tag: 'div',
    attrs: {
      class: 'rd-estado',
      'data-state': estado,
      ...(estado === 'seleccionado' && { 'data-selected': id }),
      ...(rect !== undefined && { style: enRect(rect) }),
    },
  };
}

/** Contorno de estado sobre la ruta de una Arista (SVG). */
export function pintarEstadoDeRuta(estilo: Estilo, estado: EstadoVisual, id: string, puntos: readonly Punto[]): Elemento {
  const { color, ancho, trazo, opacidad } = aspectoDeEstado(estilo, estado);
  const ruta = puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ');
  return {
    tag: 'path',
    attrs: {
      d: ruta,
      'data-state': estado,
      ...(estado === 'seleccionado' && { 'data-selected': id }),
      fill: 'none',
      stroke: color,
      'stroke-width': num(ancho),
      ...(trazo !== undefined && { 'stroke-dasharray': trazo }),
      ...(opacidad !== 1 && { opacity: num(opacidad) }),
      'pointer-events': 'none',
    },
  };
}
