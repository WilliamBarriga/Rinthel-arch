/**
 * Pintores de las Familias de efectos (sombra, glow, vidrio, filtro y
 * decoracion). Dos mitades:
 *
 * - `PINTORES_DE_EFECTOS`: declaraciones CSS que valen para todos los elementos
 *   (sombra, glow, vidrio, aro); entran en la hoja de estilo como el resto de
 *   Primitivas. Las que dependen de cada elemento devuelven `{}` aqui.
 *   Ambas salen de la tabla `EFECTOS`: un efecto nuevo es una entrada.
 * - `efectosDeElemento`: lo que si depende del elemento, con la semilla
 *   FNV-1a de su id y el nombre de la Capa (`tema/semilla`): el filtro de mano
 *   alzada, el giro y la cinta. Nunca lee el tamano de la caja ni el orden de
 *   render, asi redimensionar o colapsar no cambia el trazo.
 *
 * Todo solo pinta: puede sobresalir de la caja sin tocar las Metricas.
 */
import { fnv1a, giroDeCapa, semillaDeCapa } from 'tema';
import type { CapaPintada, NombreDePrimitiva, PinturaDeNodo } from 'tema';

import { limpiarValorCss, num } from './elemento';
import { anchoDeBorde } from './pintura/comun';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

type Declaraciones = Record<string, string>;
type Props = CapaPintada['props'];

const px = (valor: number | string | undefined): string => `${num(Number(valor))}px`;
const css = (valor: number | string | undefined): string => limpiarValorCss(String(valor));

/** Lo que los efectos por elemento anaden a la caja de un Nodo o Grupo. */
export interface EfectosDeElemento {
  /** Giro de la caja posicionada, en grados (0 sin giro): va tras su traslacion, sobre su centro. */
  giro: number;
  /** Estilo en linea del contenedor pintado (el filtro de mano alzada). */
  nodo: string;
  /** Hijos antes del contenido (filtros SVG, cintas bajo el contenido). */
  debajo: Elemento[];
  /** Hijos tras el contenido (cintas con `over`). */
  encima: Elemento[];
}

/** Lo que un efecto por elemento necesita saber de su Capa y su elemento. */
interface ContextoDeEfecto {
  estilo: Estilo;
  capas: PinturaDeNodo['capas'];
  /** Semilla de la Capa: id del elemento + nombre de Capa (+ `seed N` del Tema). */
  semilla: number;
}

/** Un efecto es de hoja (declaraciones CSS que valen para todos los elementos) o por elemento (hijos, giro o filtro propios). */
type Efecto = { readonly hoja: (props: Props) => Declaraciones } | { readonly elemento: (capa: CapaPintada, contexto: ContextoDeEfecto, resultado: EfectosDeElemento) => void };

const alLado = (capa: CapaPintada, resultado: EfectosDeElemento, hijo: Elemento): void => {
  (capa.encima === true ? resultado.encima : resultado.debajo).push(hijo);
};

/**
 * La unica tabla de efectos: anadir uno es anadir una entrada. De ella salen el nombre del efecto, el pintor
 * de hoja (`PINTORES_DE_EFECTOS`) y el aplicador por elemento (`efectosDeElemento`).
 */
const EFECTOS = {
  // Varias sombras se apilan (ver `declaracionesDeCaja`); blur 0 da la sombra dura.
  shadow: { hoja: ({ x, y, blur, spread, inset, color }) => ({ 'box-shadow': `${Number(inset) === 1 ? 'inset ' : ''}${px(x)} ${px(y)} ${px(blur)} ${px(spread)} ${css(color)}` }) },
  glow: { hoja: ({ radius, spread, color }) => ({ 'box-shadow': `0px 0px ${px(radius)} ${px(spread)} ${css(color)}` }) },
  glass: { hoja: ({ blur, saturate }) => ({ 'backdrop-filter': `blur(${px(blur)}) saturate(${num(Number(saturate))}%)` }) },
  ring: { hoja: ({ color, width, offset }) => ({ outline: `${px(width)} solid ${css(color)}`, 'outline-offset': px(offset) }) },
  sketch: {
    elemento: ({ props }, { semilla }, resultado) => {
      const idDeFiltro = `rd-sk-${fnv1a(`${semilla}|${props['roughness']}|${props['frequency']}`).toString(36)}`;
      resultado.nodo += `filter:url(#${idDeFiltro});`;
      resultado.debajo.push(filtroDeManoAlzada(idDeFiltro, semilla, Number(props['roughness']), Number(props['frequency'])));
    },
  },
  tilt: {
    elemento: ({ props }, { semilla }, resultado) => {
      resultado.giro += giroDeCapa(semilla, Number(props['degrees']));
    },
  },
  tape: { elemento: (capa, { semilla }, resultado) => alLado(capa, resultado, cinta(capa.props, semilla)) },
  fold: {
    elemento: ({ props }, { estilo, capas }, resultado) => {
      resultado.encima.push(doblez(props, estilo.fondo, anchoDeBorde(capas)));
    },
  },
  pins: { elemento: (capa, _contexto, resultado) => alLado(capa, resultado, pines(capa.props)) },
  stripe: { elemento: (capa, { capas }, resultado) => alLado(capa, resultado, franja(capa.props, anchoDeBorde(capas))) },
} as const satisfies Partial<Record<NombreDePrimitiva, Efecto>>;

type NombreDeEfecto = keyof typeof EFECTOS;

const SIN_PINTAR = (): Declaraciones => ({});

/** Pintor de hoja de cada efecto; los que se pintan por elemento no aportan declaraciones aqui. */
export const PINTORES_DE_EFECTOS: { readonly [P in NombreDeEfecto]: (props: Props) => Declaraciones } = Object.fromEntries(
  Object.entries(EFECTOS as Record<string, Efecto>).map(([nombre, efecto]) => [nombre, 'hoja' in efecto ? efecto.hoja : SIN_PINTAR]),
) as { [P in NombreDeEfecto]: (props: Props) => Declaraciones };

const SIN_EFECTOS: EfectosDeElemento = { giro: 0, nodo: '', debajo: [], encima: [] };

const esPorElemento = (tipo: string): boolean => tipo in EFECTOS && 'elemento' in (EFECTOS as Record<string, Efecto>)[tipo]!;

/** Efectos que dependen del elemento: semilla = id del elemento + nombre de Capa (+ `seed N` del Tema). */
export function efectosDeElemento(estilo: Estilo, { capas }: Pick<PinturaDeNodo, 'capas'>, id: string): EfectosDeElemento {
  if (!capas.some((c) => esPorElemento(c.tipo))) return SIN_EFECTOS;
  const resultado: EfectosDeElemento = { giro: 0, nodo: '', debajo: [], encima: [] };
  for (const capa of capas) {
    const efecto = (EFECTOS as Record<string, Efecto>)[capa.tipo];
    if (efecto !== undefined && 'elemento' in efecto) efecto.elemento(capa, { estilo, capas, semilla: semillaDeCapa(id, capa.nombre, estilo.pintura.semilla) }, resultado);
  }
  return resultado;
}

/** Filtro SVG oculto: ruido fractal sembrado que desplaza el contorno. Region relativa a la caja: no depende de su tamano. */
function filtroDeManoAlzada(idDeFiltro: string, semilla: number, rugosidad: number, frecuencia: number): Elemento {
  return {
    tag: 'svg',
    attrs: { class: 'rd-defs', width: '0', height: '0', 'aria-hidden': 'true' },
    hijos: [
      {
        tag: 'filter',
        attrs: { id: idDeFiltro, x: '-10%', y: '-10%', width: '120%', height: '120%' },
        hijos: [
          { tag: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: num(frecuencia), numOctaves: '2', seed: String(semilla % 1_000_000), result: 'ruido' } },
          { tag: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: 'ruido', scale: num(rugosidad), xChannelSelector: 'R', yChannelSelector: 'G' } },
        ],
      },
    ],
  };
}

/** Esquina doblada arriba a la derecha: dos triangulos (fondo de pagina fuera, `color` dentro) sobre el borde. */
function doblez(props: Props, fondo: string, borde: number): Elemento {
  const lado = px(props['size']);
  const sombra = props['shadow'] === undefined ? '' : `box-shadow:-2px 2px 0 ${css(props['shadow'])};`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-doblez',
      style: `top:${px(-borde)};right:${px(-borde)};border-width:0 ${lado} ${lado} 0;border-color:transparent ${css(fondo)} ${css(props['color'])} transparent;${sombra}`,
    },
  };
}

/** Direccion del gradiente que pinta la franja desde su lado. */
const HACIA: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** Franja en un lado: un elemento que cubre la caja desde su contorno exterior, con el radio de la caja, y un gradiente de corte nitido. */
function franja(props: Props, borde: number): Elemento {
  const ancho = px(props['width']);
  const cubre = `calc(100% + ${px(2 * borde)})`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-franja',
      style: `left:${px(-borde)};top:${px(-borde)};width:${cubre};height:${cubre};background:linear-gradient(to ${HACIA[String(props['side'])] ?? 'right'},${css(props['color'])} ${ancho},transparent ${ancho});`,
    },
  };
}

/** Dos peines, arriba y abajo, fuera de la caja: un solo elemento con el mismo patron en sus dos franjas. */
function pines(props: Props): Elemento {
  const largo = px(props['length']);
  const ancho = px(props['width']);
  const peine = `repeating-linear-gradient(90deg,${css(props['color'])} 0 ${ancho},transparent ${ancho} ${px(props['step'])})`;
  return {
    tag: 'div',
    attrs: {
      class: 'rd-pines',
      style: `left:${px(props['margin'])};right:${px(props['margin'])};top:-${largo};bottom:-${largo};background-image:${peine},${peine};background-size:100% ${largo},100% ${largo};background-position:0 0,0 100%;`,
    },
  };
}

/** Cinta adhesiva centrada sobre el borde superior: `angle` fijo o, sin el, ladeada hasta 3 grados con el PRNG de su Capa. */
function cinta(props: Props, semilla: number): Elemento {
  const alto = Number(props['height']);
  const giro = num(props['angle'] === undefined ? giroDeCapa(semilla, 3) : Number(props['angle']));
  return {
    tag: 'div',
    attrs: {
      class: 'rd-cinta',
      style: `left:50%;top:${num(-alto / 2)}px;width:${num(Number(props['width']))}px;height:${num(alto)}px;background:${css(props['color'])};transform:translateX(-50%) rotate(${giro}deg);`,
    },
  };
}
