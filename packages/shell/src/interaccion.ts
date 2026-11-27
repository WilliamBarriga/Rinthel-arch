/**
 * Nucleo de interaccion, puro y sin DOM; puntos y cajas en coordenadas del lienzo. El hit-test recorre la Vista
 * completa (lo que el culling no dibuja sigue siendo hallable), de arriba a abajo como dibuja `render`: etiqueta de
 * Arista, Arista (con `tolerancia`), Atributo, Nodo (el mas anidado gana).
 */
import { refTarget, edgeId, sequenceElementId, parseSequenceElementId } from 'canonical';
import type { NodeBox, Geometry, ResolvedItem, ResolvedNode, Point, Theme, Visibility, View, SequenceView, ResolvedView } from 'canonical';
import { indiceDeGeometria } from 'layout';
import { visibleAttributes, placeInBox, nodeContent, leafMetrics } from 'theme';
import { centroDeEtiquetaSinCaja, resolverEstilo } from 'render';
import type { Estilo } from 'render';

import { contiene } from './caja';
import { AJUSTES_POR_DEFECTO } from './configuracion';

export type TipoDeElemento = 'nodo' | 'arista' | 'etiqueta' | 'atributo' | 'mensaje' | 'fragmento' | 'nota';

/** Elemento seleccionable: `id` es el del Nodo, `edgeId` (Arista y etiqueta), `nodo#atributo` o, en secuencia, `interaccion:ruta` (Mensaje, Fragmento, Nota). */
export interface ElementoSeleccionable {
  tipo: TipoDeElemento;
  id: string;
}

export interface OpcionesDeHitTest {
  /** Distancia maxima al trazo de una Arista, en unidades de la geometria. Por defecto `AJUSTES_POR_DEFECTO.hitTolerance`. */
  tolerancia?: number;
  /** Si los Atributos estan dibujados (zoom semantico); sin ellos el punto cae en el Nodo. Por defecto true. */
  atributos?: boolean;
  /** Visibilidad de los Pasos: en secuencia, lo que vale 0 (no revelado) no se acierta. */
  visibilidad?: Visibility;
}

/** Lo que el hit-test lee de la Geometria; una de secuencia no tiene `edges` ni `labels`. */
type Geo = Pick<Geometry, 'nodes'> & {
  edges?: Record<string, { points: Point[] }>;
  labels?: Record<string, NodeBox>;
  lifelines?: Record<string, { x: number; y1: number; y2: number }>;
  activations?: readonly { lifeline: string; x: number; y1: number; y2: number; width: number }[];
  messages?: Record<string, { points: Point[]; label?: NodeBox }>;
  notes?: readonly (NodeBox & { ruta: string })[];
  fragments?: readonly (NodeBox & { ruta: string; nivel: number; tab: NodeBox })[];
};

function distanciaASegmento(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Caja de la etiqueta: la que reservo el layout o, si la Arista se re-enruto, una estimada sobre el segmento mas largo. */
function cajaDeEtiqueta(texto: string, puntos: readonly Point[], reservada: NodeBox | undefined, estilo: Estilo): NodeBox {
  if (reservada !== undefined) return reservada;
  const { metricas } = estilo;
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  const [width, height] = [texto.length * tamano * metricas.factorDeAncho + metricas.holguraDeEtiqueta, tamano];
  const centro = centroDeEtiquetaSinCaja(estilo, puntos);
  return { x: centro.x - width / 2, y: centro.y - height * (1 - estilo.etiqueta.centradoVertical), width, height };
}

/** Nodos en el orden en que `render` los dibuja: cada Grupo antes que sus hijos. */
function enOrdenDeDibujo(raices: readonly ResolvedNode[]): ResolvedNode[] {
  return raices.flatMap((nodo) => [nodo, ...enOrdenDeDibujo(nodo.children)]);
}

/** El elemento superior bajo `punto`, o `undefined` si no hay ninguno. */
export function elementoBajo(
  vista: ResolvedView,
  geometria: Geo,
  tema: Theme,
  punto: Point,
  { tolerancia = AJUSTES_POR_DEFECTO.hitTolerance, atributos = true, visibilidad }: OpcionesDeHitTest = {},
): ElementoSeleccionable | undefined {
  if (vista.type === 'sequence') return elementoBajoEnSecuencia(vista, geometria, punto, tolerancia, visibilidad ?? (() => 1));
  const { cajas, raices } = indiceDeGeometria(vista, geometria);
  const estilo = resolverEstilo(tema, vista.type);

  // Aristas se dibujan encima de los Nodos; la ultima dibujada es la superior.
  const aristas = vista.edges.map((arista) => ({ arista, id: edgeId(arista), puntos: geometria.edges?.[edgeId(arista)]?.points ?? [] }));
  const dibujadas = aristas.filter(({ puntos }) => puntos.length >= 2);
  for (const { arista, id, puntos } of [...dibujadas].reverse()) {
    if (arista.label !== undefined && contiene(cajaDeEtiqueta(arista.label, puntos, geometria.labels?.[id], estilo), punto)) return { tipo: 'etiqueta', id };
  }
  for (const { id, puntos } of [...dibujadas].reverse()) {
    for (let i = 1; i < puntos.length; i++) {
      if (distanciaASegmento(punto, puntos[i - 1]!, puntos[i]!) <= tolerancia) return { tipo: 'arista', id };
    }
  }

  for (const nodo of enOrdenDeDibujo(raices).reverse()) {
    const caja = cajas.get(nodo.id);
    if (caja === undefined || !contiene(caja, punto)) continue;
    const delNodo = leafMetrics(estilo.tabla, nodo);
    const filas = atributos ? visibleAttributes(nodo, delNodo) : [];
    const rectas = placeInBox(delNodo, nodeContent(nodo, delNodo), caja.width).filas;
    const indice = rectas.findIndex((r) => punto.y >= caja.y + r.y && punto.y < caja.y + r.y + r.height);
    const atributo = filas[indice];
    return atributo === undefined ? { tipo: 'nodo', id: nodo.id } : { tipo: 'atributo', id: `${nodo.id}#${atributo.name}` };
  }
  return undefined;
}

/**
 * Acierto en secuencia, de arriba a abajo: Mensaje (flecha o etiqueta), Nota, Lifeline (cabecera, linea o
 * activacion), Fragmento (solo pestana y borde: el interior deja pasar el click) y fondo. Lo que los Pasos no
 * revelaron (`visibilidad` 0) no se acierta.
 */
function elementoBajoEnSecuencia(vista: SequenceView, geometria: Geo, punto: Point, tolerancia: number, visibilidad: Visibility): ElementoSeleccionable | undefined {
  const interaccion = vista.interaction.id;
  const visible = (id: string): boolean => visibilidad(id) > 0;
  const idDe = (ruta: string): string => sequenceElementId(interaccion, ruta);

  const mensajes = Object.entries(geometria.messages ?? {}).filter(([ruta]) => visible(idDe(ruta)));
  for (const [ruta, { points, label }] of mensajes.reverse()) {
    const sobreLaFlecha = points.some((p, i) => i > 0 && distanciaASegmento(punto, points[i - 1]!, p) <= tolerancia);
    if (sobreLaFlecha || (label !== undefined && contiene(label, punto))) return { tipo: 'mensaje', id: idDe(ruta) };
  }

  const nota = [...(geometria.notes ?? [])].reverse().find((n) => visible(idDe(n.ruta)) && contiene(n, punto));
  if (nota !== undefined) return { tipo: 'nota', id: idDe(nota.ruta) };

  const { cajas } = indiceDeGeometria(vista, geometria);
  for (const nodo of vista.nodes) {
    const caja = cajas.get(nodo.id);
    if (visible(nodo.id) && caja !== undefined && contiene(caja, punto)) return { tipo: 'nodo', id: nodo.id };
  }
  const activacion = geometria.activations?.find((a) => visible(a.lifeline) && punto.x >= a.x && punto.x <= a.x + a.width && punto.y >= a.y1 && punto.y <= a.y2);
  if (activacion !== undefined) return { tipo: 'nodo', id: activacion.lifeline };
  const linea = Object.entries(geometria.lifelines ?? {}).find(([id, l]) => visible(id) && Math.abs(punto.x - l.x) <= tolerancia && punto.y >= l.y1 && punto.y <= l.y2);
  if (linea !== undefined) return { tipo: 'nodo', id: linea[0] };

  // Fragmentos: el mas anidado gana; solo cuentan la pestana y el borde.
  const marcos = [...(geometria.fragments ?? [])].filter((m) => visible(idDe(m.ruta))).sort((a, b) => b.nivel - a.nivel);
  const marco = marcos.find((m) => {
    const interior = punto.x > m.x + tolerancia && punto.x < m.x + m.width - tolerancia && punto.y > m.y + tolerancia && punto.y < m.y + m.height - tolerancia;
    return contiene(m.tab, punto) || (contiene(m, punto, tolerancia) && !interior);
  });
  return marco === undefined ? undefined : { tipo: 'fragmento', id: idDe(marco.ruta) };
}

/** Caja en el lienzo de un elemento (para marcarlo); `undefined` si ya no existe en la Vista o la geometria. */
export function cajaDeElemento(vista: ResolvedView, geometria: Geo, tema: Theme, elemento: ElementoSeleccionable): NodeBox | undefined {
  const { cajas } = indiceDeGeometria(vista, geometria);
  if (elemento.tipo === 'nodo') return cajas.get(elemento.id);
  if (elemento.tipo === 'atributo') {
    const { tabla } = resolverEstilo(tema, vista.type);
    const [idNodo = '', nombre] = elemento.id.split('#');
    const nodo = enOrdenDeDibujo(indiceDeGeometria(vista, geometria).raices).find((n) => n.id === idNodo);
    const caja = cajas.get(idNodo);
    const metricas = nodo === undefined ? tabla.base : leafMetrics(tabla, nodo);
    const atributos = nodo === undefined ? [] : visibleAttributes(nodo, metricas);
    const indice = atributos.findIndex((a) => a.name === nombre);
    if (nodo === undefined || caja === undefined || indice < 0) return undefined;
    const fila = placeInBox(metricas, nodeContent(nodo, metricas), caja.width).filas[indice]!;
    return { x: caja.x + fila.x, y: caja.y + fila.y, width: fila.width, height: fila.height };
  }
  if (elemento.tipo === 'mensaje' || elemento.tipo === 'nota' || elemento.tipo === 'fragmento') {
    const ruta = rutaDeElemento(vista, elemento.id) ?? '';
    if (elemento.tipo === 'nota') return geometria.notes?.find((n) => n.ruta === ruta);
    if (elemento.tipo === 'fragmento') return geometria.fragments?.find((m) => m.ruta === ruta);
    const puntos = geometria.messages?.[ruta]?.points ?? [];
    if (puntos.length < 2) return undefined;
    const [x, y] = [Math.min(...puntos.map((p) => p.x)), Math.min(...puntos.map((p) => p.y))];
    return { x, y, width: Math.max(...puntos.map((p) => p.x)) - x, height: Math.max(...puntos.map((p) => p.y)) - y };
  }
  const arista = vista.type === 'sequence' ? undefined : vista.edges.find((a) => edgeId(a) === elemento.id);
  const puntos = geometria.edges?.[elemento.id]?.points ?? [];
  if (arista === undefined || puntos.length < 2) return undefined;
  if (elemento.tipo === 'etiqueta') {
    return arista.label === undefined ? undefined : cajaDeEtiqueta(arista.label, puntos, geometria.labels?.[elemento.id], resolverEstilo(tema, vista.type));
  }
  const [xs, ys] = [puntos.map((p) => p.x), puntos.map((p) => p.y)];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Elementos en orden de seleccion, sin repetidos. */
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
 * es un Atributo, un `edgeId` es una Arista y el resto se toma por Nodo aunque ya no exista.
 */
export function elementoPorId(vista: ResolvedView, id: string): ElementoSeleccionable {
  const deSecuencia = elementoDeSecuencia(vista, id);
  if (deSecuencia !== undefined) return deSecuencia;
  if (vista.type !== 'sequence' && vista.edges.some((arista) => edgeId(arista) === id)) return { tipo: 'arista', id };
  return { tipo: id.includes('#') ? 'atributo' : 'nodo', id };
}

/** Ruta del elemento `id` dentro de la Interaccion de la Vista; `undefined` si `id` no es de esa Interaccion (o la Vista no es de secuencia). */
function rutaDeElemento(vista: ResolvedView, id: string): string | undefined {
  if (vista.type !== 'sequence') return undefined;
  const leido = parseSequenceElementId(id);
  return leido !== undefined && leido.operand === undefined && leido.interaction === vista.interaction.id ? leido.path : undefined;
}

function itemsAplanados(items: readonly ResolvedItem[]): ResolvedItem[] {
  return items.flatMap((item) => (item.type === 'fragment' ? [item, ...item.operands.flatMap((o) => itemsAplanados(o.items))] : [item]));
}

/** Mensaje, Fragmento (o `ref`) o Nota que nombra `interaccion:ruta` en una Vista de secuencia. */
function elementoDeSecuencia(vista: ResolvedView, id: string): ElementoSeleccionable | undefined {
  const ruta = rutaDeElemento(vista, id);
  if (vista.type !== 'sequence' || ruta === undefined) return undefined;
  const item = itemsAplanados(vista.interaction.items).find((i) => (i.type === 'message' ? i.message.path : i.path) === ruta);
  if (item === undefined) return undefined;
  return { tipo: item.type === 'message' ? 'mensaje' : item.type === 'note' ? 'nota' : 'fragmento', id };
}

/**
 * Vista a la que navega pulsar el `ref` `id` (`interaccion:ruta`): la primera Vista de secuencia que proyecta la Interaccion
 * referida (`refTarget`). `undefined` si `id` no es un `ref`, no hay Vista destino o esa Vista es la actual (inerte, sin aviso).
 */
export function destinoDeNavegacionPorRef(vista: ResolvedView, actual: string, vistas: readonly Pick<View, 'id' | 'type' | 'interaction'>[], id: string): string | undefined {
  const ruta = rutaDeElemento(vista, id);
  if (vista.type !== 'sequence' || ruta === undefined) return undefined;
  const item = itemsAplanados(vista.interaction.items).find((i) => i.type === 'ref' && i.path === ruta);
  if (item === undefined || item.type !== 'ref') return undefined;
  const destino = refTarget(vistas, item.interaction);
  return destino === actual ? undefined : destino;
}
