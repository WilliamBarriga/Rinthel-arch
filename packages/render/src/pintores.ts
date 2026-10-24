/**
 * Pintores por parte: cada uno dibuja una parte de la Vista leyendo solo del
 * Estilo resuelto, sin tokens ni numeros propios. Nodos y Grupos son HTML (cada
 * Slot en el rectangulo que reservo `layout`; el CSS solo pinta y recorta);
 * Aristas y sus etiquetas son SVG. Puros; la escena los ordena.
 */
import { sanearIcono } from 'canonico';
import type { Atributo, IconProvider, NodoResuelto } from 'canonico';
import type { CajaDeNodo } from 'layout';
import { alturaDeCabecera, colocarEnCaja, contenidoDeNodo, metricasDeHoja, tamanoDeEtiqueta, textoDeAtributo, textoDeSlot } from 'tema';
import type { ContenidoDeNodo, Metricas, NombreDeSlot, PinturaDeNodo, Rect } from 'tema';

import { pintarMarcadores, pintarTrazos, rutaDeCapa } from './aristas';
import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import { aspectoDeEstado } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';
import { pilaDeNodo } from './pilas';

type Punto = { x: number; y: number };

export interface DatosDeNodo {
  nodo: NodoResuelto;
  caja: CajaDeNodo;
  /** Color de trazo ya resuelto de la Paleta. */
  trazo: string;
  /** Texto de la etiqueta del Nodo (el titulo de un Grupo abierto; un Nodo hoja usa el que da `contenidoDeNodo`). */
  texto: string;
  icons?: IconProvider;
}

/** `left/top/width/height` en px de un rectangulo (relativo a su caja contenedora). */
function enRect(r: Rect, extra = ''): string {
  return `left:${num(r.x)}px;top:${num(r.y)}px;width:${num(r.width)}px;height:${num(r.height)}px;${extra}`;
}

/** Slot de texto: un `div` absoluto exactamente en su rectangulo; el CSS solo recorta (elipsis). */
function slotDeTexto(nombre: string, clases: string, r: Rect, texto: string, extra = ''): Elemento {
  return { tag: 'div', attrs: { class: `rd-slot ${clases}`, 'data-slot': nombre, style: enRect(r, `line-height:${num(r.height)}px;${extra}`) }, hijos: [texto] };
}

/** Lo que un pintor de Slot necesita saber del Nodo que dibuja. */
interface ContextoDeSlot {
  estilo: Estilo;
  datos: DatosDeNodo;
  /** Atributos que se dibujan (vacio si el nivel de detalle los oculta). */
  atributos: readonly Atributo[];
  /** Estilo de texto de los Slots del elemento que se dibuja (Nodo, Grupo abierto o colapsado). */
  textos: PinturaDeNodo['textos'];
  metricas: Metricas;
  contenido: ContenidoDeNodo;
}

/** Slot de una sola linea de texto, con el tamano que reservo la colocacion (y el texto que mido `layout`). */
function pintarTexto(slot: 'title' | 'badge' | 'desc' | 'footer' | 'counter', { metricas, contenido, textos }: ContextoDeSlot, rect: Rect): Elemento[] {
  const medido = textoDeSlot(slot, metricas, contenido);
  if (medido === undefined) return [];
  const tamano = medido.tamano === metricas.fontSize ? '' : `font-size:${num(medido.tamano)}px;`;
  // El contador es una caja con borde: su texto se centra en el interior.
  const borde = textos.counter?.props['border'] === undefined ? 0 : Number(textos.counter.props['border-width'] ?? 1);
  return [slotDeTexto(slot, `rd-${slot}`, rect, medido.texto, slot === 'counter' ? `${tamano}line-height:${num(rect.height - 2 * borde)}px;` : tamano)];
}

/**
 * Un pintor por Slot del catalogo, tabla exhaustiva: anadir un Slot a `tema` sin
 * pintor aqui rompe el typecheck. Cada pintor dibuja su Slot en el rectangulo que
 * la colocacion de `tema` le dio, sin posiciones propias.
 */
const PINTORES_DE_SLOT: { readonly [S in NombreDeSlot]: (contexto: ContextoDeSlot, rect: Rect) => Elemento[] } = {
  title: (contexto, rect) => pintarTexto('title', contexto, rect),
  badge: (contexto, rect) => pintarTexto('badge', contexto, rect),
  desc: (contexto, rect) => pintarTexto('desc', contexto, rect),
  footer: (contexto, rect) => pintarTexto('footer', contexto, rect),
  counter: (contexto, rect) => pintarTexto('counter', contexto, rect),
  icon: ({ datos, textos }, rect) => pintarIcono(textos, datos.nodo, datos.trazo, datos.icons, rect),
  attrs: ({ estilo, datos, atributos }, rect) => (atributos.length === 0 ? [] : [pintarAtributos(estilo, datos.nodo.id, atributos, rect)]),
};

/** Cada Slot que el Tema lista para `metricas`, en su rectangulo dentro de una caja de `ancho`. `conAtributos`: si se dibujan las filas de `attrs`. */
function pintarSlots(estilo: Estilo, datos: DatosDeNodo, metricas: Metricas, ancho: number, conAtributos: boolean): Elemento[] {
  const contenido = contenidoDeNodo(datos.nodo, metricas);
  const { slots } = colocarEnCaja(metricas, contenido, ancho);
  const contexto = { estilo, datos, metricas, contenido, atributos: conAtributos ? contenido.atributos : [], textos: pilaDeNodo(estilo.pintura, datos.nodo).pila.textos };
  return (Object.keys(slots) as NombreDeSlot[]).flatMap((slot) => PINTORES_DE_SLOT[slot](contexto, slots[slot]!));
}

/** Contenido de un Nodo (hoja, o Grupo colapsado): cada Slot que el Tema lista, en su rectangulo. */
export function pintarNodo(estilo: Estilo, datos: DatosDeNodo & { conAtributos: boolean }): Elemento[] {
  return pintarSlots(estilo, datos, metricasDeHoja(estilo.tabla, datos.nodo), datos.caja.width, datos.conAtributos);
}

/**
 * Cabecera de un Grupo abierto: los Slots de su disposicion `group` (sus hijos son Nodos de otras capas), en la
 * franja que `layout` reservo sobre ellos; a la derecha queda el sitio del control de colapso.
 */
export function pintarGrupo(estilo: Estilo, datos: DatosDeNodo): Elemento[] {
  const metricas = estilo.tabla.grupoAbierto;
  return pintarSlots(estilo, datos, metricas, Math.max(0, datos.caja.width - 2 * metricas.margenDeControl), false);
}

/**
 * Icono del Tipo de nodo dentro de `rect`. Variantes: `plain` (el glifo),
 * `box` (glifo en una caja con radio, relleno y borde) y `dot` (punto de color,
 * sin glifo). Solo se incrusta el glifo si pasa `sanearIcono`; el aspecto de la
 * caja y del punto lo da la hoja.
 */
function pintarIcono(textos: PinturaDeNodo['textos'], nodo: NodoResuelto, trazo: string, icons: IconProvider | undefined, rect: Rect): Elemento[] {
  const variante = String(textos.icon?.props['variant'] ?? 'plain');
  // Un punto es el color del Tipo y no necesita glifo: se muestra aunque el Tipo no declare icono.
  if (nodo.icon === undefined && variante !== 'dot') return [];
  const glifo = textos.icon?.props['glyph'];
  const atributos = { class: 'rd-icono', 'data-slot': 'icon', ...(nodo.icon !== undefined && { 'data-icon': nodo.icon }), 'data-variante': variante, style: enRect(rect, `color:${limpiarValorCss(String(textos.icon?.props['color'] ?? trazo))};`) };
  if (variante === 'dot') return [{ tag: 'div', attrs: atributos }];
  const crudo = nodo.icon === undefined ? undefined : icons?.resolve(nodo.icon);
  const svg = crudo === undefined ? undefined : sanearIcono(crudo);
  if (svg === undefined) return variante === 'box' ? [{ tag: 'div', attrs: atributos }] : [];
  // En caja el glifo deja un margen (o mide `glyph`); suelto ocupa todo el rectangulo.
  const disponible = Math.min(rect.width, rect.height);
  const lado = num(glifo !== undefined ? Math.min(Number(glifo), disponible) : variante === 'box' ? Math.round(disponible * 0.6) : disponible);
  const dimensionado = svg.replace(/<svg\b([^>]*)>/, (_, atributosDelSvg: string) => {
    const sinMedidas = atributosDelSvg.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, '');
    return `<svg width="${lado}" height="${lado}"${sinMedidas}>`;
  });
  return [{ tag: 'div', attrs: atributos, html: dimensionado }];
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
  const metricas = nodo.collapsed ? estilo.tabla.grupoColapsado : estilo.tabla.grupoAbierto;
  const alto = Math.min(alturaDeCabecera(metricas), caja.height);
  const rect = { x: caja.width - 2 * metricas.margenDeControl, y: 0, width: 2 * metricas.margenDeControl, height: alto };
  return {
    tag: 'div',
    attrs: { class: 'rd-control', 'data-toggle': nodo.id, style: enRect(rect, `line-height:${alto}px;`) },
    alClic,
    hijos: [nodo.collapsed ? estilo.glifos.colapsado : estilo.glifos.expandido],
  };
}

/**
 * Arista: la pila de trazos del Tema sobre la ruta ortogonal, sus marcadores de
 * extremo y la cardinalidad de cada extremo junto a su puerto, desplazada hacia
 * fuera del Nodo. `origen` es el color de Paleta del Nodo de origen (`ORIGEN`). Los hijos extra
 * (la etiqueta) los pone quien llama; `atributos` lleva opacidad e id.
 */
export function pintarArista(
  estilo: Estilo,
  datos: { id: string; puntos: readonly Punto[]; origen?: string; desde?: string; hasta?: string; atributos?: Record<string, string>; extra?: Elemento[]; alClic?: () => void },
): Elemento {
  const { id, puntos, origen, desde, hasta, atributos = {}, extra = [], alClic } = datos;
  const { arista, metricas } = estilo;
  const pintura = (origen === undefined ? undefined : estilo.pintura.arista.origenes[origen]) ?? estilo.pintura.arista;
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
      ...pintarTrazos(pintura, puntos, estilo.pintura.semilla),
      ...pintarMarcadores(estilo, pintura, puntos),
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
  // Modelo de caja de la etiqueta: con `fill` o `border` se dibuja la caja que ELK reservo (o la medida) tras el texto.
  const { fill, border, radius, color, weight, font, shadow, rotate, style } = estilo.pintura.arista.etiqueta.props;
  const anchoDeBorde = estilo.pintura.arista.etiqueta.props['border-width'];
  const conCaja = fill !== undefined || border !== undefined;
  const medida = tamanoDeEtiqueta(texto, metricas);
  const rect = caja ?? { x: centro.x - medida.width / 2, y: centro.y - tamano * etiqueta.centradoVertical - medida.height / 2, ...medida };
  const textoSvg: Elemento = {
    tag: 'text',
    attrs: {
      'data-edge-label': id,
      x: num(centro.x),
      y: num(centro.y),
      'text-anchor': 'middle',
      'font-family': font === 'mono' ? estilo.fuenteMono : estilo.fuenteCuerpo,
      'font-size': num(tamano),
      fill: color === undefined ? estilo.texto : String(color),
      ...(weight !== undefined && { 'font-weight': num(Number(weight)) }),
      ...(style === 'italic' && { 'font-style': 'italic' }),
      ...(!conCaja && { stroke: etiqueta.halo.color, 'stroke-width': num(etiqueta.halo.ancho), 'paint-order': 'stroke' }),
    },
    hijos: [texto],
  };
  if (!conCaja) return textoSvg;
  // Como el `border-radius` de CSS: el radio no pasa de la mitad del lado corto, asi una pastilla nunca es una elipse.
  const r = num(Math.min(Number(radius), rect.width / 2, rect.height / 2));
  const forma = { x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: r, ry: r };
  const sombra: Elemento[] =
    shadow === undefined ? [] : [{ tag: 'rect', attrs: { ...forma, x: num(rect.x + SOMBRA_DE_ETIQUETA), y: num(rect.y + SOMBRA_DE_ETIQUETA), fill: String(shadow) } }];
  const cajaSvg: Elemento = {
    tag: 'rect',
    attrs: {
      'data-edge-label-box': id,
      ...forma,
      fill: fill === undefined ? 'none' : String(fill),
      ...(border !== undefined && { stroke: String(border) }),
      ...(border !== undefined && anchoDeBorde !== undefined && { 'stroke-width': num(Number(anchoDeBorde)) }),
    },
  };
  const giro: Record<string, string> = rotate === undefined || Number(rotate) === 0 ? {} : { transform: `rotate(${num(Number(rotate))} ${num(rect.x + rect.width / 2)} ${num(rect.y + rect.height / 2)})` };
  return { tag: 'g', attrs: giro, hijos: [...sombra, cajaSvg, textoSvg] };
}

/** Desplazamiento (px) de la sombra dura de una etiqueta de Arista. */
const SOMBRA_DE_ETIQUETA = 2;

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
  // El contorno sigue la ruta del trazo principal (el ultimo de la pila): mismas esquinas que la Arista.
  const principal = estilo.pintura.arista.capas.at(-1);
  const ruta = principal === undefined ? puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ') : rutaDeCapa(principal, puntos);
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
