/**
 * Hoja de estilo del Estilo resuelto: lo que pinta Nodos y Grupos (HTML) se
 * compila a CSS determinista, con los estados como selectores. Pura: el mismo
 * Estilo da el mismo texto. Cada regla va bajo una clase de alcance derivada del
 * contenido, asi dos `Diagram` con Temas distintos en la misma pagina no se pisan.
 *
 * `PINTORES` es la tabla exhaustiva Primitiva -> pintor: anadir una Primitiva al
 * catalogo de `tema` sin pintor aqui rompe el typecheck.
 */
import type { CapaPintada, NombreDePrimitivaEn } from 'tema';

import { animacionDeHoja, nombresAparte } from './animacion';
import { PINTORES_DE_EFECTOS } from './efectos';
import { huella, num } from './elemento';
import { aspectoDeEstado } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';
import { PINTORES_DE_BORDE } from './pintura/borde';
import { FONDOS_ACUMULABLES, css, px } from './pintura/comun';
import type { Declaraciones, Pintor } from './pintura/comun';
import { PINTORES_DE_FORMA } from './pintura/forma';
import { declaracionesDePagina } from './pintura/pagina';
import { PINTORES_DE_RELLENO } from './pintura/relleno';

export type { Declaraciones, Pintor };

/** Un pintor por Primitiva del catalogo. El trazo puede venir de la variable `--trazo` del Nodo (su color de Tipo). */
export const PINTORES: { readonly [P in NombreDePrimitivaEn<'capa-nodo'>]: Pintor } = {
  rect: ({ radius }) => ({ 'border-radius': px(radius) }),
  border: ({ color, width }) => ({ border: `${px(width)} solid var(--trazo, ${css(color)})` }),
  ...PINTORES_DE_FORMA,
  ...PINTORES_DE_RELLENO,
  ...PINTORES_DE_BORDE,
  ...PINTORES_DE_EFECTOS,
  // La Capa `code` no pinta CSS: la dibuja su componente (ver `codigo.ts`).
  code: () => ({}),
};

/** Sombras (box-shadow): se apilan separadas por coma y la ultima Capa queda encima (va primero en CSS). */
const SOMBRAS = 'box-shadow';

/** Declaraciones de la caja de un Nodo o Grupo: las Capas de abajo hacia arriba; sin Capas, el aspecto por defecto del Estilo. */
export function declaracionesDeCaja(estilo: Estilo): Declaraciones {
  const aparte = nombresAparte(estilo);
  const capas = estilo.pintura.nodo.capas.filter((capa) => !aparte.has(capa.nombre));
  if (capas.length === 0 && estilo.pintura.nodo.capas.length === 0) {
    return {
      'border-radius': px(estilo.nodo.radio),
      background: css(estilo.nodo.relleno),
      border: `1px solid var(--trazo, ${css(estilo.borde)})`,
    };
  }
  const declaraciones: Declaraciones = {};
  const acumulados: Record<string, string[]> = {};
  const sombras: string[] = [];
  for (const capa of capas) {
    for (const [propiedad, valor] of Object.entries(PINTORES[capa.tipo as NombreDePrimitivaEn<'capa-nodo'>](capa.props))) {
      if (propiedad === SOMBRAS) sombras.unshift(valor);
      else if ((FONDOS_ACUMULABLES as readonly string[]).includes(propiedad)) (acumulados[propiedad] ??= []).push(valor);
      else declaraciones[propiedad] = valor;
    }
  }
  // Al final y en orden fijo: el relleno solido (`background`, que reinicia las imagenes) no puede pisar los patrones.
  for (const propiedad of FONDOS_ACUMULABLES) if (acumulados[propiedad] !== undefined) declaraciones[propiedad] = acumulados[propiedad].join(',');
  if (sombras.length > 0) declaraciones[SOMBRAS] = sombras.join(', ');
  return declaraciones;
}

const bloque = (declaraciones: Declaraciones): string =>
  Object.entries(declaraciones)
    .map(([propiedad, valor]) => `${propiedad}:${valor}`)
    .join(';');

function declaracionesDeEstado(estilo: Estilo, estado: EstadoVisual): Declaraciones {
  const { color, ancho, trazo, opacidad } = aspectoDeEstado(estilo, estado);
  return {
    border: `${px(ancho)} ${trazo === undefined ? 'solid' : 'dashed'} ${css(color)}`,
    ...(opacidad !== 1 && { opacity: num(opacidad) }),
  };
}

/** Reglas sin alcance: selector (con `&` por la clase de alcance) y declaraciones. */
function reglas(estilo: Estilo): Array<[string, Declaraciones]> {
  const { metricas } = estilo;
  const caja = declaracionesDeCaja(estilo);
  const radio = caja['border-radius'] ?? '0px';
  return [
    ['&', { position: 'relative', overflow: 'hidden', 'user-select': 'none', background: css(estilo.fondo), color: css(estilo.texto), 'font-family': css(estilo.fuenteCuerpo), 'font-size': px(metricas.fontSize) }],
    ['& .rd-mundo', { position: 'absolute', left: '0', top: '0', 'transform-origin': '0 0' }],
    ['& .rd-capa', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'pointer-events': 'none' }],
    ['& .rd-aristas', { overflow: 'visible' }],
    ['& .rd-aristas [data-edge], & .rd-aristas [data-edge-labels]', { 'pointer-events': 'stroke' }],
    ['& .rd-pagina', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'pointer-events': 'none', ...declaracionesDePagina(estilo.pintura.pagina.capas) }],
    ['& .rd-caja', { position: 'absolute', left: '0', top: '0', contain: 'layout style' }],
    ['& .rd-nodo, & .rd-grupo', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'auto', ...caja }],
    ['& .rd-nodo[data-collapsed]', { 'border-style': 'dashed' }],
    ['& .rd-cinta', { position: 'absolute', 'pointer-events': 'none' }],
    ['& .rd-defs', { position: 'absolute', 'pointer-events': 'none' }],
    // Capa `code`: contenedor de tamano fijo (el de la caja, en linea); el componente no puede cambiarlo.
    ['& .rd-codigo', { position: 'absolute', left: '0', top: '0', 'pointer-events': 'none', contain: 'layout style' }],
    ['& .rd-slot', { position: 'absolute', overflow: 'hidden', 'white-space': 'nowrap', 'text-overflow': 'ellipsis', 'box-sizing': 'border-box' }],
    ['& .rd-title', { 'text-align': 'center' }],
    ['& .rd-encabezado', { 'text-align': 'left' }],
    ['& .rd-separado', { 'border-top': '1px solid var(--trazo, currentColor)' }],
    ['& .rd-fila', { position: 'absolute', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'padding-left': px(metricas.margenDeTexto), 'box-sizing': 'border-box', 'font-family': css(estilo.fuenteMono), 'font-size': px(metricas.fontSize * metricas.escalaAtributo) }],
    ...reglasDeTexto(estilo),
    ['& .rd-icono', { position: 'absolute', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'box-sizing': 'border-box' }],
    ...reglasDeIcono(estilo),
    ['& .rd-control', { position: 'absolute', 'text-align': 'center', cursor: 'pointer', 'font-family': css(estilo.fuenteMono) }],
    ['& .rd-estado', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'none', 'border-radius': radio }],
    ['& [data-atenuado]', { opacity: num(estilo.estados.atenuado.opacidad) }],
    ...(Object.keys(estilo.estados) as EstadoVisual[]).filter((estado) => estado !== 'atenuado').map((estado): [string, Declaraciones] => [`& .rd-estado[data-state="${estado}"]`, declaracionesDeEstado(estilo, estado)]),
  ];
}

/** Aspecto del Slot `icon` segun su estilo `icon`: caja (radio, relleno, borde) o punto; el lado ya lo fijo la colocacion. */
function reglasDeIcono(estilo: Estilo): Array<[string, Declaraciones]> {
  const props = estilo.pintura.nodo.textos.icon?.props ?? {};
  const { radius, fill, border } = props;
  const reglas: Array<[string, Declaraciones]> = [
    [
      '& .rd-icono[data-variante="box"]',
      { 'border-radius': px(radius ?? 6), ...(fill !== undefined && { background: css(fill) }), ...(border !== undefined && { border: `1px solid ${css(border)}` }) },
    ],
    ['& .rd-icono[data-variante="dot"]', { 'border-radius': '50%', background: fill !== undefined ? css(fill) : 'currentColor', ...(border !== undefined && { border: `1px solid ${css(border)}` }) }],
  ];
  return reglas;
}

/** Estilo de texto (`text`) de cada Slot que el Tema lo declara; solo pinta, no cambia el espacio reservado. */
function reglasDeTexto(estilo: Estilo): Array<[string, Declaraciones]> {
  return Object.entries(estilo.pintura.nodo.textos).map(([slot, texto]): [string, Declaraciones] => {
    const { weight, color, style, transform } = texto.props;
    return [
      `& .rd-slot[data-slot="${slot}"]`,
      {
        'font-weight': css(weight),
        'font-style': css(style),
        'text-transform': transform === 'uppercase' ? 'uppercase' : 'none',
        ...(color !== undefined && { color: css(color) }),
      },
    ];
  });
}

const FORMATO_DE_FUENTE: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/**
 * `@font-face` de cada cara del Estilo, con la URL que entrega el consumidor (en `dev`, la ruta de fuentes
 * del servidor). `block` evita medir y pintar con la fuente de reserva y saltar despues (research `fuentes-tema`).
 * Global, no va bajo la clase de alcance: una cara es de la pagina.
 */
export function hojaDeFuentes(caras: Estilo['caras'], urlDeFuente: (ruta: string) => string): string {
  return caras
    .map((cara) => {
      const formato = FORMATO_DE_FUENTE[cara.ruta.slice(cara.ruta.lastIndexOf('.') + 1).toLowerCase()] ?? 'woff2';
      const url = urlDeFuente(cara.ruta).replace(/["'()\\<>{};\n\r]/g, encodeURIComponent);
      return `@font-face{font-family:"${cara.familia.replace(/["\\]/g, '')}";font-style:${cara.estilo};font-weight:${cara.peso};font-display:block;src:url("${url}") format("${formato}")}`;
    })
    .join('\n');
}

/** Hoja de estilo del Estilo: `clase` es la de alcance que debe llevar el contenedor del dibujo; con `urlDeFuente` incluye los `@font-face`. */
export function compilarHoja(estilo: Estilo, urlDeFuente?: (ruta: string) => string): { clase: string; css: string } {
  const animacion = animacionDeHoja(estilo, (capa) => PINTORES[capa.tipo as NombreDePrimitivaEn<'capa-nodo'>](capa.props));
  const todas = [...reglas(estilo), ...animacion.reglas];
  const clase = `rd-${huella(todas.map(([selector, d]) => `${selector}{${bloque(d)}}`).join('') + animacion.bloques.join(''))}`;
  const alcance = (selector: string): string => selector.replace(/&/g, `.${clase}`);
  const caras = urlDeFuente === undefined || estilo.caras.length === 0 ? [] : [hojaDeFuentes(estilo.caras, urlDeFuente)];
  const texto = [...caras, ...todas.map(([selector, d]) => `${selector.split(', ').map(alcance).join(',')}{${bloque(d)}}`), ...animacion.bloques.map(alcance)].join('\n');
  return { clase, css: texto };
}
