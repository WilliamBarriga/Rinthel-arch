/**
 * Hoja de estilo del Estilo resuelto: lo que pinta Nodos y Grupos (HTML) se
 * compila a CSS determinista, con los estados como selectores. Pura: el mismo
 * Estilo da el mismo texto. Cada regla va bajo una clase de alcance derivada del
 * contenido, asi dos `Diagram` con Temas distintos en la misma pagina no se pisan.
 *
 * `PINTORES` es la tabla exhaustiva Primitiva -> pintor: anadir una Primitiva al
 * catalogo de `tema` sin pintor aqui rompe el typecheck.
 */
import type { NombreDePrimitiva } from 'tema';

import { PINTORES_DE_EFECTOS } from './efectos';
import { num } from './elemento';
import type { EstadoVisual, Estilo } from './estilo';
import { PINTORES_DE_BORDE } from './pintura/borde';
import { FONDOS_ACUMULABLES, css, px } from './pintura/comun';
import type { Declaraciones, Pintor } from './pintura/comun';
import { PINTORES_DE_FORMA } from './pintura/forma';
import { PINTORES_DE_RELLENO } from './pintura/relleno';

export type { Declaraciones, Pintor };

/** Un pintor por Primitiva del catalogo. El trazo puede venir de la variable `--trazo` del Nodo (su color de Tipo). */
export const PINTORES: { readonly [P in NombreDePrimitiva]: Pintor } = {
  rect: ({ radius }) => ({ 'border-radius': px(radius) }),
  solid: ({ color }) => ({ background: css(color) }),
  border: ({ color, width }) => ({ border: `${px(width)} solid var(--trazo, ${css(color)})` }),
  ...PINTORES_DE_FORMA,
  ...PINTORES_DE_RELLENO,
  ...PINTORES_DE_BORDE,
  ...PINTORES_DE_EFECTOS,
};

/** Sombras (box-shadow): se apilan separadas por coma y la ultima Capa queda encima (va primero en CSS). */
const SOMBRAS = 'box-shadow';

/** Declaraciones de la caja de un Nodo o Grupo: las Capas de abajo hacia arriba; sin Capas, el aspecto por defecto del Estilo. */
export function declaracionesDeCaja(estilo: Estilo): Declaraciones {
  const { capas } = estilo.pintura.nodo;
  if (capas.length === 0) {
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
    for (const [propiedad, valor] of Object.entries(PINTORES[capa.tipo](capa.props))) {
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

/** FNV-1a de 32 bits, en base 36: identificador corto y estable del contenido. */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

function declaracionesDeEstado(estilo: Estilo, estado: EstadoVisual): Declaraciones {
  const { color, ancho, trazo, opacidad } = estilo.estados[estado];
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
    ['& .rd-aristas [data-edge]', { 'pointer-events': 'stroke' }],
    ['& .rd-caja', { position: 'absolute', left: '0', top: '0', contain: 'layout style' }],
    ['& .rd-nodo, & .rd-grupo', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'auto', ...caja }],
    ['& .rd-nodo[data-collapsed]', { 'border-style': 'dashed' }],
    ['& .rd-cinta', { position: 'absolute', 'pointer-events': 'none' }],
    ['& .rd-defs', { position: 'absolute', 'pointer-events': 'none' }],
    ['& .rd-slot', { position: 'absolute', overflow: 'hidden', 'white-space': 'nowrap', 'text-overflow': 'ellipsis', 'box-sizing': 'border-box' }],
    ['& .rd-title', { 'text-align': 'center' }],
    ['& .rd-encabezado', { 'text-align': 'left' }],
    ['& .rd-separado', { 'border-top': '1px solid var(--trazo, currentColor)' }],
    ['& .rd-fila', { position: 'absolute', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'padding-left': px(metricas.margenDeTexto), 'box-sizing': 'border-box', 'font-family': css(estilo.fuenteMono), 'font-size': px(metricas.fontSize * metricas.escalaAtributo) }],
    ['& .rd-icono', { position: 'absolute' }],
    ['& .rd-control', { position: 'absolute', 'text-align': 'center', cursor: 'pointer', 'font-family': css(estilo.fuenteMono) }],
    ['& .rd-estado', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', 'box-sizing': 'border-box', 'pointer-events': 'none', 'border-radius': radio }],
    ...(Object.keys(estilo.estados) as EstadoVisual[]).map((estado): [string, Declaraciones] => [`& .rd-estado[data-state="${estado}"]`, declaracionesDeEstado(estilo, estado)]),
  ];
}

/** Hoja de estilo del Estilo: `clase` es la de alcance que debe llevar el contenedor del dibujo. */
export function compilarHoja(estilo: Estilo): { clase: string; css: string } {
  const todas = reglas(estilo);
  const clase = `rd-${huella(todas.map(([selector, d]) => `${selector}{${bloque(d)}}`).join(''))}`;
  const alcance = (selector: string): string => selector.replace(/&/g, `.${clase}`);
  const texto = todas.map(([selector, d]) => `${selector.split(', ').map(alcance).join(',')}{${bloque(d)}}`).join('\n');
  return { clase, css: texto };
}
