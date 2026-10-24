/**
 * Pintores de las Familias de efectos (sombra, glow, vidrio, filtro y
 * decoracion). Dos mitades:
 *
 * - `PINTORES_DE_EFECTOS`: declaraciones CSS que valen para todos los elementos
 *   (sombra, glow, vidrio, aro); entran en la hoja de estilo como el resto de
 *   Primitivas. Las que dependen de cada elemento (mano alzada, giro, cinta)
 *   devuelven `{}` aqui.
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
type NombreDeEfecto = Extract<NombreDePrimitiva, 'shadow' | 'glow' | 'glass' | 'sketch' | 'tilt' | 'tape' | 'ring' | 'fold' | 'pins' | 'stripe'>;

const px = (valor: number | string | undefined): string => `${num(Number(valor))}px`;
const css = (valor: number | string | undefined): string => limpiarValorCss(String(valor));

export const PINTORES_DE_EFECTOS: { readonly [P in NombreDeEfecto]: (props: Props) => Declaraciones } = {
  // Varias sombras se apilan (ver `declaracionesDeCaja`); blur 0 da la sombra dura.
  shadow: ({ x, y, blur, spread, inset, color }) => ({ 'box-shadow': `${Number(inset) === 1 ? 'inset ' : ''}${px(x)} ${px(y)} ${px(blur)} ${px(spread)} ${css(color)}` }),
  glow: ({ radius, spread, color }) => ({ 'box-shadow': `0px 0px ${px(radius)} ${px(spread)} ${css(color)}` }),
  glass: ({ blur, saturate }) => ({ 'backdrop-filter': `blur(${px(blur)}) saturate(${num(Number(saturate))}%)` }),
  ring: ({ color, width, offset }) => ({ outline: `${px(width)} solid ${css(color)}`, 'outline-offset': px(offset) }),
  // Por elemento: ver `efectosDeElemento`.
  sketch: () => ({}),
  tilt: () => ({}),
  tape: () => ({}),
  fold: () => ({}),
  pins: () => ({}),
  stripe: () => ({}),
};

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

const SIN_EFECTOS: EfectosDeElemento = { giro: 0, nodo: '', debajo: [], encima: [] };

/** Primitivas que se pintan por elemento (con su semilla o como hijos propios), no en la hoja. */
const POR_ELEMENTO: ReadonlySet<string> = new Set<NombreDeEfecto>(['sketch', 'tilt', 'tape', 'fold', 'pins', 'stripe']);

/** Efectos que dependen del elemento: semilla = id del elemento + nombre de Capa (+ `seed N` del Tema). */
export function efectosDeElemento(estilo: Estilo, { capas }: Pick<PinturaDeNodo, 'capas'>, id: string): EfectosDeElemento {
  const semillaDelTema = estilo.pintura.semilla;
  if (!capas.some((c) => POR_ELEMENTO.has(c.tipo))) return SIN_EFECTOS;
  const resultado: EfectosDeElemento = { giro: 0, nodo: '', debajo: [], encima: [] };
  for (const capa of capas) {
    const semilla = semillaDeCapa(id, capa.nombre, semillaDelTema);
    if (capa.tipo === 'sketch') {
      const idDeFiltro = `rd-sk-${fnv1a(`${semilla}|${capa.props['roughness']}|${capa.props['frequency']}`).toString(36)}`;
      resultado.nodo += `filter:url(#${idDeFiltro});`;
      resultado.debajo.push(filtroDeManoAlzada(idDeFiltro, semilla, Number(capa.props['roughness']), Number(capa.props['frequency'])));
    } else if (capa.tipo === 'tilt') {
      resultado.giro += giroDeCapa(semilla, Number(capa.props['degrees']));
    } else if (capa.tipo === 'tape') {
      (capa.encima === true ? resultado.encima : resultado.debajo).push(cinta(capa.props, semilla));
    } else if (capa.tipo === 'fold') {
      resultado.encima.push(doblez(capa.props, estilo.fondo, anchoDeBorde(capas)));
    } else if (capa.tipo === 'pins') {
      (capa.encima === true ? resultado.encima : resultado.debajo).push(pines(capa.props));
    } else if (capa.tipo === 'stripe') {
      (capa.encima === true ? resultado.encima : resultado.debajo).push(franja(capa.props, anchoDeBorde(capas)));
    }
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
