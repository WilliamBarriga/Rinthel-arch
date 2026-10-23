/**
 * Escena de una Vista: el arbol de elementos SVG que `renderToSvgString` y el
 * componente `Diagram` dibujan por igual. Pura: sin reloj, sin estado, sin DOM;
 * la misma entrada da el mismo arbol. Los valores de atributo van sin escapar:
 * cada salida (cadena o React) escapa a su manera. Ordena y compone; el aspecto
 * de cada parte lo dibujan los pintores (`pintores.ts`) desde el Estilo resuelto.
 */
import { idDeArista } from 'canonico';
import type { AristaResuelta, IconProvider, NodoResuelto, Tema, VistaResuelta, Visibilidad } from 'canonico';
import { atributosVisibles, indiceDeGeometria } from 'layout';
import type { Geometria, Metricas } from 'layout';

import { num } from './elemento';
import type { Elemento } from './elemento';
import { resolverEstilo } from './estilo';
import type { Estilo } from './estilo';
import { pintarArista, pintarControl, pintarEtiquetaDeArista, pintarFlecha, pintarFondo, pintarGrupo, pintarNodo } from './pintores';

export type { Elemento } from './elemento';

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
  /** Metricas con las que dibujar; deben ser las del layout. Por defecto las derivadas del Tema. */
  metricas?: Metricas;
  /** Estilo resuelto con el que dibujar; por defecto el del Tema (`resolverEstilo`). */
  estilo?: Estilo;
}

interface Contexto extends EntradaDeEscena {
  visibility: Visibilidad;
  estilo: Estilo;
}

/**
 * Construye la escena. Nodos y Grupos con el Estilo resuelto del Tema (un color es siempre
 * un nombre de Paleta resuelto contra la paleta; sin color, o con un nombre
 * que el Tema no tiene, se usa el borde), y encima las Aristas. Lanza si
 * un Nodo de la Vista no esta en la geometria (geometria de otra Vista) o si el
 * Tema no cumple el contrato.
 */
export function construirEscena(entrada: EntradaDeEscena): Elemento {
  const { view, geometry, theme, width, height, camera } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, entrada.metricas);
  const contexto: Contexto = { ...entrada, visibility: entrada.visibility ?? (() => 1), estilo };
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
      pintarFondo(estilo, geometry.width, geometry.height),
      pintarFlecha(estilo),
      ...raices.map((nodo) => nodoSvg(nodo, contexto)),
      ...view.edges.flatMap((arista) => aristaSvg(arista, contexto)),
    ],
  };
}

function nodoSvg(nodo: NodoResuelto, contexto: Contexto): Elemento {
  const caja = contexto.geometry.nodes[nodo.id];
  if (caja === undefined) throw new Error(`El Nodo '${nodo.id}' no esta en la geometria`);
  const { estilo, onSelect, onToggle, icons } = contexto;
  const esGrupo = nodo.children.length > 0;
  const trazo = colorDeTrazo(nodo, estilo);
  // El `label` de la Vista (override o, si no hay, el titulo) manda en todos los niveles.
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;
  const datos = { nodo, caja, trazo, texto, icons };
  const conmutable = esGrupo || (nodo.collapsed && nodo.link === undefined);

  return {
    tag: 'g',
    attrs: { 'data-id': nodo.id, transform: `translate(${num(caja.x)} ${num(caja.y)})` },
    hijos: [
      {
        tag: 'g',
        attrs: { 'data-part': 'nodo', ...opacidad(contexto.visibility(nodo.id)) },
        ...(onSelect !== undefined && { alClic: () => onSelect(nodo.id) }),
        hijos: [
          ...(esGrupo ? pintarGrupo(estilo, datos) : pintarNodo(estilo, { ...datos, conAtributos: tieneFilas(nodo, contexto.detail) })),
          ...(onToggle !== undefined && conmutable ? [pintarControl(estilo, { nodo, caja, alClic: () => onToggle(nodo.id) })] : []),
        ],
      },
      ...nodo.children.map((hijo) => nodoSvg(hijo, contexto)),
    ],
  };
}

function tieneFilas(nodo: NodoResuelto, detail?: NivelDeDetalle): boolean {
  return (detail === undefined || detail === 'completo') && atributosVisibles(nodo).length > 0;
}

/** Valor de la Paleta para el color del Nodo; sin color, o desconocido, el borde del Estilo. */
function colorDeTrazo(nodo: NodoResuelto, estilo: Estilo): string {
  return (nodo.color !== undefined ? estilo.paleta[nodo.color] : undefined) ?? estilo.borde;
}

/** Arista con su etiqueta. Una Arista sin ruta en la geometria (ELK no la enruto) se omite. */
function aristaSvg(arista: AristaResuelta, { geometry, estilo, onSelect, visibility }: Contexto): Elemento[] {
  const id = idDeArista(arista);
  const puntos = geometry.edges[id]?.points;
  if (puntos === undefined || puntos.length < 2) return [];
  return [
    pintarArista(estilo, {
      id,
      puntos,
      desde: arista.fromCardinality,
      hasta: arista.toCardinality,
      atributos: opacidad(visibility(id)),
      extra: arista.label === undefined ? [] : [pintarEtiquetaDeArista(estilo, { id, texto: arista.label, puntos, caja: geometry.labels[id] })],
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
    }),
  ];
}

/** `opacity` solo si no es 1, acotada a [0, 1]; un NaN cuenta como 0. Con 0 no recibe clics. */
function opacidad(visibilidad: number): Record<string, string> {
  const valor = Number.isNaN(visibilidad) ? 0 : Math.min(Math.max(visibilidad, 0), 1);
  if (valor === 1) return {};
  return valor === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(valor) };
}
