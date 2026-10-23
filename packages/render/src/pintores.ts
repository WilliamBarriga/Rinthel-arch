/**
 * Pintores por parte: cada uno dibuja una parte de la Vista (fondo, Nodo, Grupo,
 * Arista, etiqueta, control) leyendo solo del Estilo resuelto, sin tokens ni
 * numeros propios. Puros; la escena los ordena y decide el que se dibuja.
 */
import { sanearIcono } from 'canonico';
import type { IconProvider, NodoResuelto } from 'canonico';
import { atributosVisibles, textoDeAtributo, yDeFila } from 'layout';
import type { CajaDeNodo } from 'layout';

import { num } from './elemento';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

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
  const { metricas } = estilo;
  return [
    caja(datos, estilo),
    pintarEtiqueta(estilo, texto, {
      x: num(c.width / 2),
      y: num(conAtributos ? metricas.cabecera / 2 : c.height / 2),
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    }),
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

/** Separador bajo la cabecera y una fila de texto por Atributo, en orden. */
function pintarAtributos(estilo: Estilo, nodo: NodoResuelto, caja: CajaDeNodo, trazo: string): Elemento[] {
  const { metricas } = estilo;
  return [
    { tag: 'line', attrs: { x1: '0', y1: num(metricas.cabecera), x2: num(caja.width), y2: num(metricas.cabecera), stroke: trazo } },
    ...atributosVisibles(nodo).map((atributo, i) => ({
      tag: 'text',
      attrs: {
        'data-attribute': `${nodo.id}#${atributo.name}`,
        x: num(metricas.margenDeTexto),
        y: num(yDeFila(metricas, i)),
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

/** Definicion del marcador de flecha de las Aristas. */
export function pintarFlecha(estilo: Estilo): Elemento {
  const { color, flecha } = estilo.arista;
  return {
    tag: 'defs',
    attrs: {},
    hijos: [
      {
        tag: 'marker',
        attrs: { id: idDeFlecha(color), viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: num(flecha.ancho), markerHeight: num(flecha.alto), orient: 'auto' },
        hijos: [{ tag: 'path', attrs: { d: flecha.forma, fill: color } }],
      },
    ],
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
      { tag: 'path', attrs: { d: ruta, fill: 'none', stroke: arista.color, 'marker-end': `url(#${idDeFlecha(arista.color)})` } },
      ...cardinalidades,
      ...extra,
    ],
  };
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
  const { metricas, etiqueta, arista } = estilo;
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  let centro = { x: 0, y: 0 };
  if (caja !== undefined) {
    centro = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 + tamano * etiqueta.centradoVertical };
  } else {
    let mejor = -1;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1]!;
      const b = puntos[i]!;
      const largo = Math.hypot(b.x - a.x, b.y - a.y);
      if (largo > mejor) {
        mejor = largo;
        centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - arista.elevacionEtiquetaSinCaja };
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
