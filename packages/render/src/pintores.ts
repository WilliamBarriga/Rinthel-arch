/**
 * Pintores por parte: cada uno dibuja una parte de la Vista (fondo, Nodo, Grupo,
 * Arista, etiqueta, control) leyendo solo del Estilo resuelto, sin tokens ni
 * numeros propios. Puros; la escena los ordena y decide el que se dibuja.
 */
import { sanearIcono } from 'canonico';
import type { IconProvider, NodoResuelto } from 'canonico';
import type { CajaDeNodo } from 'layout';
import { atributosVisibles, colocarEnCaja, textoDeAtributo } from 'tema';

import { num } from './elemento';
import type { Elemento } from './elemento';
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

/** Fondo del lienzo. */
export function pintarFondo(estilo: Estilo, ancho: number, alto: number): Elemento {
  return { tag: 'rect', attrs: { width: num(ancho), height: num(alto), fill: estilo.fondo } };
}

/** Caja de un Nodo o Grupo: radio, relleno y trazo del Estilo; discontinua si esta colapsado. */
function caja({ nodo, caja, trazo }: DatosDeNodo, estilo: Estilo): Elemento {
  return {
    tag: 'rect',
    attrs: {
      width: num(caja.width),
      height: num(caja.height),
      rx: String(estilo.nodo.radio),
      fill: estilo.nodo.relleno,
      stroke: trazo,
      ...(nodo.collapsed && { 'stroke-dasharray': estilo.nodo.trazoColapsado }),
    },
  };
}

/** Nodo (hoja, o Grupo colapsado): caja, etiqueta centrada, icono y filas de Atributos. `conAtributos`: si se dibujan las filas. */
export function pintarNodo(estilo: Estilo, datos: DatosDeNodo & { conAtributos: boolean }): Elemento[] {
  const { nodo, caja: c, trazo, texto, conAtributos, icons } = datos;
  const filas = conAtributos ? atributosVisibles(nodo, estilo.metricas).length : 0;
  // Cada Slot se pinta en el rectangulo que reservo `layout` (colocacion de `tema`).
  const { slots } = colocarEnCaja(estilo.metricas, filas, c.width);
  const titulo = slots.title;
  return [
    caja(datos, estilo),
    ...(titulo === undefined
      ? []
      : [
          pintarEtiqueta(estilo, texto, {
            x: num(titulo.x + titulo.width / 2),
            y: num(filas > 0 ? titulo.y + titulo.height / 2 : c.height / 2),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          }),
        ]),
    ...pintarIcono(estilo, nodo, trazo, icons),
    ...(conAtributos ? pintarAtributos(estilo, nodo, c, trazo) : []),
  ];
}

/** Grupo abierto: caja, titulo arriba a la izquierda e icono. */
export function pintarGrupo(estilo: Estilo, datos: DatosDeNodo): Elemento[] {
  const { metricas } = estilo;
  return [
    caja(datos, estilo),
    pintarEtiqueta(estilo, datos.texto, { x: num(metricas.margenDeTexto), y: num(metricas.baseDeTitulo) }),
    ...pintarIcono(estilo, datos.nodo, datos.trazo, datos.icons),
  ];
}

function pintarEtiqueta(estilo: Estilo, texto: string, posicion: Record<string, string>): Elemento {
  return {
    tag: 'text',
    attrs: { ...posicion, 'font-family': estilo.fuenteCuerpo, 'font-size': num(estilo.metricas.fontSize), fill: estilo.texto },
    hijos: [texto],
  };
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
  return [{ tag: 'g', attrs: { 'data-icon': nodo.icon, transform: `translate(${metricas.margenIcono} ${metricas.margenIcono})`, color: trazo }, html: dimensionado }];
}

/** Separador sobre el Slot `attrs` y una fila de texto por Atributo, en orden, cada una en su rectangulo. */
function pintarAtributos(estilo: Estilo, nodo: NodoResuelto, caja: CajaDeNodo, trazo: string): Elemento[] {
  const { metricas } = estilo;
  const atributos = atributosVisibles(nodo, metricas);
  const { slots, filas } = colocarEnCaja(metricas, atributos.length, caja.width);
  const zona = slots.attrs;
  if (zona === undefined) return [];
  return [
    ...(zona.y > 0 ? [{ tag: 'line', attrs: { x1: '0', y1: num(zona.y), x2: num(caja.width), y2: num(zona.y), stroke: trazo } }] : []),
    ...atributos.map((atributo, i) => ({
      tag: 'text',
      attrs: {
        'data-attribute': `${nodo.id}#${atributo.name}`,
        x: num(metricas.margenDeTexto),
        y: num(filas[i]!.y + filas[i]!.height / 2),
        'dominant-baseline': 'central',
        'font-family': estilo.fuenteMono,
        'font-size': num(metricas.fontSize * metricas.escalaAtributo),
        fill: estilo.texto,
      },
      hijos: [textoDeAtributo(atributo)],
    })),
  ];
}

/** Control de colapso de un Grupo: el glifo del Estilo segun el estado. */
export function pintarControl(estilo: Estilo, { nodo, caja, alClic }: { nodo: NodoResuelto; caja: CajaDeNodo; alClic: () => void }): Elemento {
  const { metricas } = estilo;
  return {
    tag: 'g',
    attrs: { 'data-toggle': nodo.id },
    alClic,
    hijos: [
      {
        tag: 'text',
        attrs: {
          x: num(caja.width - metricas.margenDeControl),
          y: num(metricas.baseDeTitulo),
          'text-anchor': 'middle',
          'font-family': estilo.fuenteMono,
          'font-size': num(metricas.fontSize),
          fill: estilo.texto,
        },
        hijos: [nodo.collapsed ? estilo.glifos.colapsado : estilo.glifos.expandido],
      },
    ],
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

function atributosDeEstado(estilo: Estilo, estado: EstadoVisual, id: string): Record<string, string> {
  const { color, ancho, trazo, opacidad } = estilo.estados[estado];
  return {
    'data-state': estado,
    ...(estado === 'seleccionado' && { 'data-selected': id }),
    fill: 'none',
    stroke: color,
    'stroke-width': num(ancho),
    ...(trazo !== undefined && { 'stroke-dasharray': trazo }),
    ...(opacidad !== 1 && { opacity: num(opacidad) }),
    'pointer-events': 'none',
  };
}

/** Contorno de estado alrededor de una caja (Nodo, Grupo o fila de Atributo), en coordenadas locales del Nodo. */
export function pintarEstadoDeCaja(estilo: Estilo, estado: EstadoVisual, id: string, caja: CajaDeNodo): Elemento {
  return {
    tag: 'rect',
    attrs: { x: num(caja.x), y: num(caja.y), width: num(caja.width), height: num(caja.height), rx: String(estilo.nodo.radio), ...atributosDeEstado(estilo, estado, id) },
  };
}

/** Contorno de estado sobre la ruta de una Arista. */
export function pintarEstadoDeRuta(estilo: Estilo, estado: EstadoVisual, id: string, puntos: readonly Punto[]): Elemento {
  const ruta = puntos.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ');
  return { tag: 'path', attrs: { d: ruta, ...atributosDeEstado(estilo, estado, id) } };
}
