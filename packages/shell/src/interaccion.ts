/**
 * Nucleo de interaccion: puro, sin DOM. Responde que hay bajo un punto del lienzo
 * (`elementoBajo`), donde esta cada elemento (`cajaDeElemento`) y modela la
 * Seleccion (`seleccionar`). `VistaActiva` solo traduce eventos de raton a puntos
 * y pinta lo que este modulo decide.
 *
 * Los puntos y cajas estan en coordenadas del lienzo (las de la Geometria). El
 * hit-test recorre la Vista completa: lo que el culling del viewport no dibuja
 * sigue siendo hallable. Orden de arriba a abajo, como dibuja `render`: etiqueta
 * de Arista, Arista (con `tolerancia`), Atributo, Nodo (el mas anidado gana).
 */
import { idDeArista } from 'canonico';
import type { NodoResuelto, Tema, VistaResuelta } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeNodo, Geometria, Punto } from 'layout';
import { atributosVisibles, colocarEnCaja } from 'tema';
import { centroDeEtiquetaSinCaja, resolverEstilo } from 'render';
import type { Estilo } from 'render';

import { AJUSTES_POR_DEFECTO } from './configuracion';

export type TipoDeElemento = 'nodo' | 'arista' | 'etiqueta' | 'atributo';

/** Elemento seleccionable: `id` es el del Nodo, `idDeArista` (Arista y etiqueta) o `nodo#atributo`. */
export interface ElementoSeleccionable {
  tipo: TipoDeElemento;
  id: string;
}

export interface OpcionesDeHitTest {
  /** Distancia maxima al trazo de una Arista, en unidades de la geometria. Por defecto `AJUSTES_POR_DEFECTO.hitTolerance`. */
  tolerancia?: number;
  /** Si los Atributos estan dibujados (zoom semantico); sin ellos el punto cae en el Nodo. Por defecto true. */
  atributos?: boolean;
}

type Geo = Pick<Geometria, 'nodes' | 'edges' | 'labels'>;

const contiene = (caja: CajaDeNodo, p: Punto): boolean =>
  p.x >= caja.x && p.x <= caja.x + caja.width && p.y >= caja.y && p.y <= caja.y + caja.height;

function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Caja de la etiqueta: la que reservo el layout o, si la Arista se re-enruto, una estimada sobre el segmento mas largo. */
function cajaDeEtiqueta(texto: string, puntos: readonly Punto[], reservada: CajaDeNodo | undefined, estilo: Estilo): CajaDeNodo {
  if (reservada !== undefined) return reservada;
  const { metricas } = estilo;
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  const [width, height] = [texto.length * tamano * metricas.factorDeAncho + metricas.holguraDeEtiqueta, tamano];
  const centro = centroDeEtiquetaSinCaja(estilo, puntos);
  return { x: centro.x - width / 2, y: centro.y - height * (1 - estilo.etiqueta.centradoVertical), width, height };
}

/** Nodos en el orden en que `render` los dibuja: cada Grupo antes que sus hijos. */
function enOrdenDeDibujo(raices: readonly NodoResuelto[]): NodoResuelto[] {
  return raices.flatMap((nodo) => [nodo, ...enOrdenDeDibujo(nodo.children)]);
}

/** El elemento superior bajo `punto`, o `undefined` si no hay ninguno. */
export function elementoBajo(
  vista: VistaResuelta,
  geometria: Geo,
  tema: Tema,
  punto: Punto,
  { tolerancia = AJUSTES_POR_DEFECTO.hitTolerance, atributos = true }: OpcionesDeHitTest = {},
): ElementoSeleccionable | undefined {
  const { cajas, raices } = indiceDeGeometria(vista, geometria);
  const estilo = resolverEstilo(tema);
  const { metricas } = estilo;

  // Aristas se dibujan encima de los Nodos; la ultima dibujada es la superior.
  const aristas = vista.edges.map((arista) => ({ arista, id: idDeArista(arista), puntos: geometria.edges[idDeArista(arista)]?.points ?? [] }));
  const dibujadas = aristas.filter(({ puntos }) => puntos.length >= 2);
  for (const { arista, id, puntos } of [...dibujadas].reverse()) {
    if (arista.label !== undefined && contiene(cajaDeEtiqueta(arista.label, puntos, geometria.labels[id], estilo), punto)) return { tipo: 'etiqueta', id };
  }
  for (const { id, puntos } of [...dibujadas].reverse()) {
    for (let i = 1; i < puntos.length; i++) {
      if (distanciaASegmento(punto, puntos[i - 1]!, puntos[i]!) <= tolerancia) return { tipo: 'arista', id };
    }
  }

  for (const nodo of enOrdenDeDibujo(raices).reverse()) {
    const caja = cajas.get(nodo.id);
    if (caja === undefined || !contiene(caja, punto)) continue;
    const filas = atributos ? atributosVisibles(nodo, metricas) : [];
    const rectas = colocarEnCaja(metricas, filas.length, caja.width).filas;
    const indice = rectas.findIndex((r) => punto.y >= caja.y + r.y && punto.y < caja.y + r.y + r.height);
    const atributo = filas[indice];
    return atributo === undefined ? { tipo: 'nodo', id: nodo.id } : { tipo: 'atributo', id: `${nodo.id}#${atributo.name}` };
  }
  return undefined;
}

/** Caja en el lienzo de un elemento (para marcarlo); `undefined` si ya no existe en la Vista o la geometria. */
export function cajaDeElemento(vista: VistaResuelta, geometria: Geo, tema: Tema, elemento: ElementoSeleccionable): CajaDeNodo | undefined {
  const { cajas } = indiceDeGeometria(vista, geometria);
  if (elemento.tipo === 'nodo') return cajas.get(elemento.id);
  if (elemento.tipo === 'atributo') {
    const { metricas } = resolverEstilo(tema);
    const [idNodo = '', nombre] = elemento.id.split('#');
    const nodo = enOrdenDeDibujo(indiceDeGeometria(vista, geometria).raices).find((n) => n.id === idNodo);
    const caja = cajas.get(idNodo);
    const atributos = nodo === undefined ? [] : atributosVisibles(nodo, metricas);
    const indice = atributos.findIndex((a) => a.name === nombre);
    if (caja === undefined || indice < 0) return undefined;
    const fila = colocarEnCaja(metricas, atributos.length, caja.width).filas[indice]!;
    return { x: caja.x + fila.x, y: caja.y + fila.y, width: fila.width, height: fila.height };
  }
  const arista = vista.edges.find((a) => idDeArista(a) === elemento.id);
  const puntos = geometria.edges[elemento.id]?.points ?? [];
  if (arista === undefined || puntos.length < 2) return undefined;
  if (elemento.tipo === 'etiqueta') {
    return arista.label === undefined ? undefined : cajaDeEtiqueta(arista.label, puntos, geometria.labels[elemento.id], resolverEstilo(tema));
  }
  const [xs, ys] = [puntos.map((p) => p.x), puntos.map((p) => p.y)];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Seleccion: elementos en orden de seleccion, sin repetidos. */
export type Seleccion = readonly ElementoSeleccionable[];
export const SELECCION_VACIA: Seleccion = [];

export type ModoDeSeleccion = 'reemplazar' | 'agregar' | 'quitar' | 'alternar';

const mismo = (a: ElementoSeleccionable, b: ElementoSeleccionable): boolean => a.tipo === b.tipo && a.id === b.id;

/** Seleccion que resulta de aplicar `elemento` con `modo`; no muta la de entrada. */
export function seleccionar(seleccion: Seleccion, elemento: ElementoSeleccionable, modo: ModoDeSeleccion): Seleccion {
  const esta = seleccion.some((e) => mismo(e, elemento));
  switch (modo) {
    case 'reemplazar':
      return [elemento];
    case 'agregar':
      return esta ? seleccion : [...seleccion, elemento];
    case 'quitar':
      return seleccion.filter((e) => !mismo(e, elemento));
    case 'alternar':
      return esta ? seleccion.filter((e) => !mismo(e, elemento)) : [...seleccion, elemento];
  }
}

/**
 * El elemento de la Vista que nombra `id` (puede venir de una Seleccion guardada en el hash): `nodo#atributo`
 * es un Atributo, un `idDeArista` es una Arista y el resto se toma por Nodo aunque ya no exista.
 */
export function elementoPorId(vista: VistaResuelta, id: string): ElementoSeleccionable {
  if (vista.edges.some((arista) => idDeArista(arista) === id)) return { tipo: 'arista', id };
  return { tipo: id.includes('#') ? 'atributo' : 'nodo', id };
}
