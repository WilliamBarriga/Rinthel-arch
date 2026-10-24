/**
 * Pintores de la Arista (ADR 0008): la pila de trazos y los marcadores de
 * extremo, leyendo solo de la pintura del Estilo resuelto. Son SVG puro y
 * solo pintan: ni los trazos ni los marcadores entran en las Metricas (de la
 * Arista solo cuenta la caja de la etiqueta). Cada marcador es una forma
 * explicita girada hacia la ruta, sin `<marker>` ni ids que compartir.
 */
import type { NombreDePrimitivaEn, PinturaDeArista, PrimitivaPintada } from 'tema';

import { huella, num } from './elemento';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

type Punto = { x: number; y: number };
type Props = PrimitivaPintada['props'];

/** `stroke-dasharray` y remates de cada estilo de trazo, segun su grosor `w`. */
const ESTILOS: Record<string, (w: number) => Record<string, string>> = {
  solid: () => ({}),
  dashed: (w) => ({ 'stroke-dasharray': `${num(4 * w)} ${num(2 * w)}` }),
  dotted: (w) => ({ 'stroke-dasharray': `0 ${num(2 * w)}`, 'stroke-linecap': 'round' }),
  pixel: (w) => ({ 'stroke-dasharray': `${num(w)} ${num(w)}`, 'shape-rendering': 'crispEdges' }),
};

const unidad = (a: Punto, b: Punto): Punto => {
  const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo };
};

export type Esquina = 'sharp' | 'chamfer' | 'round';

/**
 * Ruta `M ... L ...`; con `chamfer` cada esquina se corta a `medida` y con `round`
 * se curva con una `Q` de radio `medida` (ambas limitadas a la mitad del segmento mas corto).
 */
export function rutaDeTrazo(puntos: readonly Punto[], esquina: Esquina, medida: number): string {
  const orden: Array<Punto & { curva?: Punto }> = [];
  puntos.forEach((p, i) => {
    const a = puntos[i - 1];
    const c = puntos[i + 1];
    if (esquina === 'sharp' || a === undefined || c === undefined) {
      orden.push(p);
      return;
    }
    const k = Math.min(medida, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(c.x - p.x, c.y - p.y) / 2);
    const entra = unidad(a, p);
    const sale = unidad(p, c);
    orden.push({ x: p.x - entra.x * k, y: p.y - entra.y * k }, { x: p.x + sale.x * k, y: p.y + sale.y * k, ...(esquina === 'round' && { curva: p }) });
  });
  return orden.map(({ x, y, curva }, i) => (curva !== undefined ? `Q ${num(curva.x)} ${num(curva.y)} ` : i === 0 ? 'M ' : 'L ') + `${num(x)} ${num(y)}`).join(' ');
}

/** Trazo a mano alzada de una Capa: su desplazamiento (`roughness`, 0 si no tiene) y la frecuencia del ruido. */
const manoAlzada = (props: Props): { rugosidad: number; frecuencia: number } => ({ rugosidad: Number(props['roughness'] ?? 0), frecuencia: Number(props['frequency'] ?? 0) });

/** Id del filtro de mano alzada de un trazo: el mismo para las mismas propiedades y semilla. */
const idDeFiltro = (props: Props, semilla: number): string => {
  const { rugosidad, frecuencia } = manoAlzada(props);
  return `rd-skl-${huella(`${rugosidad}|${frecuencia}|${semilla}`)}`;
};

/** La pila de trazos, de abajo hacia arriba: un trazo ancho y translucido bajo el principal es el glow. */
export function pintarTrazos(pintura: PinturaDeArista, puntos: readonly Punto[], semilla = 0): Elemento[] {
  return pintura.capas.map((capa) => {
    const { color, width, style, corner, cut, radius } = capa.props as Props & { style: string; corner: Esquina };
    const grosor = Number(width);
    return {
      tag: 'path',
      attrs: {
        d: rutaDeTrazo(puntos, corner, Number(corner === 'round' ? radius : cut)),
        fill: 'none',
        stroke: String(color),
        'stroke-width': num(grosor),
        'data-capa': capa.nombre,
        ...(ESTILOS[style]?.(grosor) ?? {}),
        ...(capa.props['cap'] !== undefined && { 'stroke-linecap': String(capa.props['cap']) }),
        ...(manoAlzada(capa.props).rugosidad > 0 && { filter: `url(#${idDeFiltro(capa.props, semilla)})` }),
      },
    };
  });
}

/**
 * Filtros de mano alzada de los trazos del Estilo, uno por cada combinacion de propiedades, para el lienzo de
 * Aristas (`ancho` x `alto`). Region en coordenadas del lienzo: con la caja del trazo un tramo recto (alto 0) desapareceria.
 */
export function filtrosDeTrazo(estilo: Estilo, ancho: number, alto: number): Elemento[] {
  const semilla = estilo.pintura.semilla ?? 0;
  const pinturas = [estilo.pintura.arista, ...Object.values(estilo.pintura.arista.origenes)];
  const filtros = new Map<string, Elemento>();
  for (const capa of pinturas.flatMap((p) => p.capas)) {
    const { rugosidad, frecuencia } = manoAlzada(capa.props);
    const id = idDeFiltro(capa.props, semilla);
    if (rugosidad <= 0 || filtros.has(id)) continue;
    filtros.set(id, {
      tag: 'filter',
      attrs: { id, filterUnits: 'userSpaceOnUse', x: num(-MARGEN_DE_FILTRO), y: num(-MARGEN_DE_FILTRO), width: num(ancho + 2 * MARGEN_DE_FILTRO), height: num(alto + 2 * MARGEN_DE_FILTRO) },
      hijos: [
        { tag: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: String(Math.round(frecuencia * 1000) / 1000), numOctaves: '2', seed: String(semilla % 1_000_000), result: 'ruido' } },
        { tag: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: 'ruido', scale: num(rugosidad), xChannelSelector: 'R', yChannelSelector: 'G' } },
      ],
    });
  }
  return filtros.size === 0 ? [] : [{ tag: 'defs', attrs: {}, hijos: [...filtros.values()] }];
}

/** Lo que la region del filtro de un trazo sobresale del lienzo, para que el desplazamiento no recorte los bordes. */
const MARGEN_DE_FILTRO = 40;

type Dibujo = (lado: number, color: string, fondo: string) => Elemento[];

/** Forma de cada marcador en su marco local: la punta en el origen, mirando hacia +x (hacia fuera de la ruta). Tabla exhaustiva sobre el catalogo. */
const MARCADORES: { readonly [M in NombreDePrimitivaEn<'marcador'>]: Dibujo } = {
  arrow: (s, color) => [{ tag: 'path', attrs: { d: `M 0 0 L ${num(-s)} ${num(-s / 2)} L ${num(-s)} ${num(s / 2)} z`, fill: color } }],
  dot: (s, color) => [{ tag: 'circle', attrs: { cx: num(-s / 2), cy: '0', r: num(s / 2), fill: color } }],
  square: (s, color) => [{ tag: 'rect', attrs: { x: num(-s), y: num(-s / 2), width: num(s), height: num(s), fill: color } }],
  diamond: (s, color) => [{ tag: 'path', attrs: { d: `M 0 0 L ${num(-s / 2)} ${num(-s / 2)} L ${num(-s)} 0 L ${num(-s / 2)} ${num(s / 2)} z`, fill: color } }],
  bar: (s, color) => [{ tag: 'path', attrs: { d: `M 0 ${num(-s / 2)} L 0 ${num(s / 2)}`, stroke: color, 'stroke-width': num(Math.max(2, s / 4)), fill: 'none' } }],
  hollow: (s, color, fondo) => [{ tag: 'circle', attrs: { cx: num(-s / 2), cy: '0', r: num(s / 2), fill: fondo, stroke: color, 'stroke-width': '1' } }],
  chevron: (s, color) => [
    {
      tag: 'path',
      attrs: { d: `M ${num(-0.65 * s)} ${num(-0.35 * s)} L 0 0 L ${num(-0.65 * s)} ${num(0.35 * s)}`, fill: 'none', stroke: color, 'stroke-width': num(Math.max(1, s / 7)), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    },
  ],
  // Almohadilla de una via: centrada en el extremo (no detras de la punta), disco del color con el agujero del fondo.
  via: (s, color, fondo) => [
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: num(s / 2), fill: color } },
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: num(s / 5), fill: fondo } },
  ],
};

function marcador(estilo: Estilo, primitiva: PrimitivaPintada | undefined, extremo: Punto, vecino: Punto, lado: 'origen' | 'fin'): Elemento[] {
  if (primitiva === undefined) return [];
  const dibujo = MARCADORES[primitiva.tipo as NombreDePrimitivaEn<'marcador'>];
  const angulo = (Math.atan2(extremo.y - vecino.y, extremo.x - vecino.x) * 180) / Math.PI;
  return [
    {
      tag: 'g',
      attrs: { 'data-marker': lado, transform: `translate(${num(extremo.x)} ${num(extremo.y)}) rotate(${num(angulo)})` },
      hijos: dibujo(Number(primitiva.props['size']), String(primitiva.props['color']), estilo.fondo),
    },
  ];
}

/** Marcadores de origen y fin, girados segun el primer y el ultimo segmento de la ruta. */
export function pintarMarcadores(estilo: Estilo, pintura: PinturaDeArista, puntos: readonly Punto[]): Elemento[] {
  const [primero, segundo] = [puntos[0], puntos[1]];
  const [ultimo, penultimo] = [puntos[puntos.length - 1], puntos[puntos.length - 2]];
  if (primero === undefined || segundo === undefined || ultimo === undefined || penultimo === undefined) return [];
  return [...marcador(estilo, pintura.origen, primero, segundo, 'origen'), ...marcador(estilo, pintura.fin, ultimo, penultimo, 'fin')];
}
