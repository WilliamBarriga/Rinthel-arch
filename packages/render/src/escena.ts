/**
 * Escena de una Vista: el arbol de elementos que dibuja el componente `Diagram`.
 * Render hibrido (ADR 0008): tres capas planas en coordenadas absolutas del
 * lienzo, en este orden de apilado (Grupos HTML, Aristas SVG, Nodos HTML), bajo un
 * unico contenedor con un solo `transform` de pan/zoom; asi HTML y SVG quedan
 * alineados a cualquier zoom. Pura: sin reloj, sin estado, sin DOM; la misma
 * entrada da el mismo arbol. Los valores de atributo van sin escapar: React los
 * escapa. Ordena y compone; el aspecto lo dan la hoja de estilo (`hoja.ts`) y los
 * pintores (`pintores.ts`) desde el Estilo resuelto.
 */
import { idDeArista } from 'canonico';
import type { AristaResuelta, IconProvider, NodoResuelto, Tema, VistaResuelta, Visibilidad } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeNodo, Geometria } from 'layout';
import { atributosVisibles, colocarEnCaja } from 'tema';
import type { Metricas } from 'tema';

import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import { efectosDeElemento } from './efectos';
import { resolverEstilo } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';
import { compilarHoja } from './hoja';
import { pintarArista, pintarControl, pintarEstadoDeCaja, pintarEstadoDeRuta, pintarEtiquetaDeArista, pintarFlecha, pintarGrupo, pintarNodo } from './pintores';

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
 * cajas, rutas y la camara son identicas en los tres.
 */
export type NivelDeDetalle = 'etiqueta' | 'titulo' | 'completo';

/** Estados visuales por id de elemento (Nodo, Arista o `nodo#atributo`); un elemento puede tener varios. */
export type Estados = Readonly<Record<string, readonly EstadoVisual[]>>;

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
  /** Estados visuales (seleccionado, hover, fantasma, en-ruta, atenuado, foco) que se dibujan con el Estilo resuelto; sin ellos, ninguno. */
  estados?: Estados;
  /** Estilo resuelto con el que dibujar; por defecto el del Tema (`resolverEstilo`). */
  estilo?: Estilo;
}

interface Contexto extends EntradaDeEscena {
  visibility: Visibilidad;
  estilo: Estilo;
  /** Cajas en coordenadas del lienzo (las de la geometria son relativas al Grupo padre). */
  cajas: ReadonlyMap<string, CajaDeNodo>;
}

/**
 * Construye la escena. Nodos y Grupos con el Estilo resuelto del Tema (un color es siempre
 * un nombre de Paleta resuelto contra la paleta; sin color, o con un nombre
 * que el Tema no tiene, se usa el borde), y entre ambos las Aristas. Lanza si
 * un Nodo de la Vista no esta en la geometria (geometria de otra Vista) o si el
 * Tema no cumple el contrato.
 */
export function construirEscena(entrada: EntradaDeEscena): Elemento {
  const { view, geometry, theme, width, height, camera } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, entrada.metricas);
  const { raices, cajas } = indiceDeGeometria(view, geometry);
  const contexto: Contexto = { ...entrada, visibility: entrada.visibility ?? (() => 1), estilo, cajas };
  const vista = camera ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };
  const hoja = compilarHoja(estilo);

  // Mismo encuadre que un `viewBox` con `preserveAspectRatio` por defecto: escala uniforme, centrada.
  const k = Math.min(width / vista.width, height / vista.height);
  const tx = (width - vista.width * k) / 2 - vista.x * k;
  const ty = (height - vista.height * k) / 2 - vista.y * k;
  const nodos = raices.flatMap((nodo) => aplanar(nodo));

  return {
    tag: 'div',
    attrs: {
      class: hoja.clase,
      'data-diagram': '',
      'data-camara': `${num(vista.x)} ${num(vista.y)} ${num(vista.width)} ${num(vista.height)}`,
      style: `width:${num(width)}px;height:${num(height)}px;`,
    },
    hijos: [
      { tag: 'style', attrs: {}, html: hoja.css },
      {
        tag: 'div',
        attrs: {
          class: 'rd-mundo',
          style: `width:${num(geometry.width)}px;height:${num(geometry.height)}px;transform:translate(${num(tx)}px,${num(ty)}px) scale(${num(k)});`,
        },
        hijos: [
          { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, hijos: nodos.filter(esGrupo).map((nodo) => cajaDeNodo(nodo, contexto)) },
          {
            tag: 'svg',
            attrs: {
              class: 'rd-capa rd-aristas',
              'data-capa': 'aristas',
              xmlns: 'http://www.w3.org/2000/svg',
              width: num(geometry.width),
              height: num(geometry.height),
              viewBox: `0 0 ${num(geometry.width)} ${num(geometry.height)}`,
              'aria-hidden': 'true',
            },
            hijos: [pintarFlecha(estilo), ...view.edges.flatMap((arista) => aristaSvg(arista, contexto))],
          },
          { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: nodos.filter((n) => !esGrupo(n)).map((nodo) => cajaDeNodo(nodo, contexto)) },
        ],
      },
    ],
  };
}

const esGrupo = (nodo: NodoResuelto): boolean => nodo.children.length > 0;

/** Nodos en preorden (un Grupo antes que sus hijos): el orden de apilado dentro de cada capa. */
function aplanar(nodo: NodoResuelto): NodoResuelto[] {
  return [nodo, ...nodo.children.flatMap(aplanar)];
}

/** Estilo en linea de la caja de un Nodo/Grupo: su posicion absoluta y tamano (unicos valores que vienen de la geometria). */
function posicion(caja: CajaDeNodo): string {
  return `width:${num(caja.width)}px;height:${num(caja.height)}px;transform:translate(${num(caja.x)}px,${num(caja.y)}px);`;
}

function cajaDeNodo(nodo: NodoResuelto, contexto: Contexto): Elemento {
  const caja = contexto.cajas.get(nodo.id);
  if (caja === undefined) throw new Error(`El Nodo '${nodo.id}' no esta en la geometria`);
  const { estilo, onSelect, onToggle, icons, detail } = contexto;
  const grupo = esGrupo(nodo);
  const trazo = colorDeTrazo(nodo, estilo);
  // El `label` de la Vista (override o, si no hay, el titulo) manda en todos los niveles.
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;
  const datos = { nodo, caja, trazo, texto, icons };
  const conmutable = grupo || (nodo.collapsed && nodo.link === undefined);
  const efectos = efectosDeElemento(estilo, nodo.id);

  return {
    tag: 'div',
    attrs: { class: 'rd-caja', 'data-id': nodo.id, ...(atenuado(contexto.estados, nodo.id) && { 'data-atenuado': '' }), style: posicion(caja) + efectos.caja },
    hijos: [
      {
        tag: 'div',
        attrs: {
          class: grupo ? 'rd-grupo' : 'rd-nodo',
          'data-part': 'nodo',
          ...(nodo.collapsed && { 'data-collapsed': '' }),
          style: `--trazo:${limpiarValorCss(trazo)};${opacidad(contexto.visibility(nodo.id))}${efectos.nodo}`,
        },
        ...(onSelect !== undefined && { alClic: () => onSelect(nodo.id) }),
        hijos: [
          ...efectos.debajo,
          ...(grupo ? pintarGrupo(estilo, datos) : pintarNodo(estilo, { ...datos, conAtributos: tieneFilas(nodo, estilo, detail) })),
          ...(onToggle !== undefined && conmutable ? [pintarControl(estilo, { nodo, caja, alClic: () => onToggle(nodo.id) })] : []),
          ...efectos.encima,
        ],
      },
      ...estadosDeNodo(nodo, caja, contexto),
    ],
  };
}

function estadosDeNodo(nodo: NodoResuelto, caja: CajaDeNodo, { estados, estilo, detail }: Contexto): Elemento[] {
  if (estados === undefined) return [];
  const propios = contornos(estados[nodo.id]).map((e) => pintarEstadoDeCaja(e, nodo.id));
  if (esGrupo(nodo) || !tieneFilas(nodo, estilo, detail)) return propios;
  const atributos = atributosVisibles(nodo, estilo.metricas);
  const rectas = colocarEnCaja(estilo.metricas, atributos.length, caja.width).filas;
  const filas = atributos.flatMap((atributo, i) => {
    const id = `${nodo.id}#${atributo.name}`;
    return contornos(estados[id]).map((e) => pintarEstadoDeCaja(e, id, rectas[i]!));
  });
  return [...propios, ...filas];
}

/** `atenuado` no tiene contorno: atenua el elemento entero (marca `data-atenuado`, estilada por la hoja). */
const atenuado = (estados: Estados | undefined, id: string): boolean => estados?.[id]?.includes('atenuado') === true;
const contornos = (lista: readonly EstadoVisual[] | undefined): EstadoVisual[] => (lista ?? []).filter((e) => e !== 'atenuado');

function tieneFilas(nodo: NodoResuelto, estilo: Estilo, detail?: NivelDeDetalle): boolean {
  return (detail === undefined || detail === 'completo') && atributosVisibles(nodo, estilo.metricas).length > 0;
}

/** Valor de la Paleta para el color del Nodo; sin color, o desconocido, el borde del Estilo. */
function colorDeTrazo(nodo: NodoResuelto, estilo: Estilo): string {
  return (nodo.color !== undefined ? estilo.paleta[nodo.color] : undefined) ?? estilo.borde;
}

/** Arista con su etiqueta. Una Arista sin ruta en la geometria (ELK no la enruto) se omite. */
function aristaSvg(arista: AristaResuelta, { geometry, estilo, onSelect, visibility, estados }: Contexto): Elemento[] {
  const id = idDeArista(arista);
  const puntos = geometry.edges[id]?.points;
  if (puntos === undefined || puntos.length < 2) return [];
  const v = visibilidadSvg(visibility(id));
  return [
    pintarArista(estilo, {
      id,
      puntos,
      desde: arista.fromCardinality,
      hasta: arista.toCardinality,
      atributos: atenuado(estados, id) ? { ...v, 'data-atenuado': '' } : v,
      extra: [
        ...(arista.label === undefined ? [] : [pintarEtiquetaDeArista(estilo, { id, texto: arista.label, puntos, caja: geometry.labels[id] })]),
        ...contornos(estados?.[id]).map((e) => pintarEstadoDeRuta(estilo, e, id, puntos)),
      ],
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
    }),
  ];
}

/** Visibilidad acotada a [0, 1]; un NaN cuenta como 0. */
function acotar(visibilidad: number): number {
  return Number.isNaN(visibilidad) ? 0 : Math.min(Math.max(visibilidad, 0), 1);
}

/** `opacity` en linea solo si no es 1. Con 0 no recibe clics. */
function opacidad(visibilidad: number): string {
  const valor = acotar(visibilidad);
  if (valor === 1) return '';
  return valor === 0 ? 'opacity:0;pointer-events:none;' : `opacity:${num(valor)};`;
}

/** Lo mismo para un elemento SVG, como atributos. */
function visibilidadSvg(visibilidad: number): Record<string, string> {
  const valor = acotar(visibilidad);
  if (valor === 1) return {};
  return valor === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(valor) };
}
