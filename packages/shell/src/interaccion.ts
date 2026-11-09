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
import { destinoDeRef, idDeArista } from 'canonico';
import type { ItemResuelto, NodoResuelto, Tema, Vista, Visibilidad, VistaResuelta } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeNodo, Geometria, Punto } from 'layout';
import { atributosVisibles, colocarEnCaja, contenidoDeNodo, metricasDeHoja } from 'tema';
import { centroDeEtiquetaSinCaja, resolverEstilo } from 'render';
import type { Estilo } from 'render';

import { AJUSTES_POR_DEFECTO } from './configuracion';

export type TipoDeElemento = 'nodo' | 'arista' | 'etiqueta' | 'atributo' | 'mensaje' | 'fragmento' | 'nota';

/** Elemento seleccionable: `id` es el del Nodo, `idDeArista` (Arista y etiqueta), `nodo#atributo` o, en secuencia, `interaccion:ruta` (Mensaje, Fragmento, Nota). */
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
  visibilidad?: Visibilidad;
}

/** Lo que el hit-test lee de la Geometria; una de secuencia no tiene `edges` ni `labels` (sus Mensajes no son seleccionables todavia). */
type Geo = Pick<Geometria, 'nodes'> & {
  edges?: Record<string, { points: Punto[] }>;
  labels?: Record<string, CajaDeNodo>;
  lifelines?: Record<string, { x: number; y1: number; y2: number }>;
  activations?: readonly { lifeline: string; x: number; y1: number; y2: number; width: number }[];
  messages?: Record<string, { points: Punto[]; label?: CajaDeNodo }>;
  notes?: readonly (CajaDeNodo & { ruta: string })[];
  fragments?: readonly (CajaDeNodo & { ruta: string; nivel: number; tab: CajaDeNodo })[];
};

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
  { tolerancia = AJUSTES_POR_DEFECTO.hitTolerance, atributos = true, visibilidad }: OpcionesDeHitTest = {},
): ElementoSeleccionable | undefined {
  if (vista.type === 'sequence') return elementoBajoEnSecuencia(vista, geometria, punto, tolerancia, visibilidad ?? (() => 1));
  const { cajas, raices } = indiceDeGeometria(vista, geometria);
  const estilo = resolverEstilo(tema, undefined, undefined, undefined, vista.type);

  // Aristas se dibujan encima de los Nodos; la ultima dibujada es la superior.
  const aristas = vista.edges.map((arista) => ({ arista, id: idDeArista(arista), puntos: geometria.edges?.[idDeArista(arista)]?.points ?? [] }));
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
    const delNodo = metricasDeHoja(estilo.tabla, nodo);
    const filas = atributos ? atributosVisibles(nodo, delNodo) : [];
    const rectas = colocarEnCaja(delNodo, contenidoDeNodo(nodo, delNodo), caja.width).filas;
    const indice = rectas.findIndex((r) => punto.y >= caja.y + r.y && punto.y < caja.y + r.y + r.height);
    const atributo = filas[indice];
    return atributo === undefined ? { tipo: 'nodo', id: nodo.id } : { tipo: 'atributo', id: `${nodo.id}#${atributo.name}` };
  }
  return undefined;
}

/**
 * Acierto en secuencia (ADR 0009), de arriba a abajo: Mensaje (flecha o etiqueta), Nota, Lifeline (cabecera, linea o
 * activacion), Fragmento (solo pestana y borde: el interior deja pasar el click) y fondo. Lo que los Pasos no
 * revelaron (`visibilidad` 0) no se acierta.
 */
function elementoBajoEnSecuencia(vista: VistaResuelta, geometria: Geo, punto: Punto, tolerancia: number, visibilidad: Visibilidad): ElementoSeleccionable | undefined {
  const interaccion = vista.interaction?.id ?? '';
  const visible = (id: string): boolean => visibilidad(id) > 0;
  const idDe = (ruta: string): string => `${interaccion}:${ruta}`;

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
    const dentro = (t: number): boolean => punto.x >= m.x - t && punto.x <= m.x + m.width + t && punto.y >= m.y - t && punto.y <= m.y + m.height + t;
    const interior = punto.x > m.x + tolerancia && punto.x < m.x + m.width - tolerancia && punto.y > m.y + tolerancia && punto.y < m.y + m.height - tolerancia;
    return contiene(m.tab, punto) || (dentro(tolerancia) && !interior);
  });
  return marco === undefined ? undefined : { tipo: 'fragmento', id: idDe(marco.ruta) };
}

/** Caja en el lienzo de un elemento (para marcarlo); `undefined` si ya no existe en la Vista o la geometria. */
export function cajaDeElemento(vista: VistaResuelta, geometria: Geo, tema: Tema, elemento: ElementoSeleccionable): CajaDeNodo | undefined {
  const { cajas } = indiceDeGeometria(vista, geometria);
  if (elemento.tipo === 'nodo') return cajas.get(elemento.id);
  if (elemento.tipo === 'atributo') {
    const { tabla } = resolverEstilo(tema, undefined, undefined, undefined, vista.type);
    const [idNodo = '', nombre] = elemento.id.split('#');
    const nodo = enOrdenDeDibujo(indiceDeGeometria(vista, geometria).raices).find((n) => n.id === idNodo);
    const caja = cajas.get(idNodo);
    const metricas = nodo === undefined ? tabla.base : metricasDeHoja(tabla, nodo);
    const atributos = nodo === undefined ? [] : atributosVisibles(nodo, metricas);
    const indice = atributos.findIndex((a) => a.name === nombre);
    if (nodo === undefined || caja === undefined || indice < 0) return undefined;
    const fila = colocarEnCaja(metricas, contenidoDeNodo(nodo, metricas), caja.width).filas[indice]!;
    return { x: caja.x + fila.x, y: caja.y + fila.y, width: fila.width, height: fila.height };
  }
  if (elemento.tipo === 'mensaje' || elemento.tipo === 'nota' || elemento.tipo === 'fragmento') {
    const ruta = elemento.id.slice((vista.interaction?.id.length ?? 0) + 1);
    if (elemento.tipo === 'nota') return geometria.notes?.find((n) => n.ruta === ruta);
    if (elemento.tipo === 'fragmento') return geometria.fragments?.find((m) => m.ruta === ruta);
    const puntos = geometria.messages?.[ruta]?.points ?? [];
    if (puntos.length < 2) return undefined;
    const [x, y] = [Math.min(...puntos.map((p) => p.x)), Math.min(...puntos.map((p) => p.y))];
    return { x, y, width: Math.max(...puntos.map((p) => p.x)) - x, height: Math.max(...puntos.map((p) => p.y)) - y };
  }
  const arista = vista.edges.find((a) => idDeArista(a) === elemento.id);
  const puntos = geometria.edges?.[elemento.id]?.points ?? [];
  if (arista === undefined || puntos.length < 2) return undefined;
  if (elemento.tipo === 'etiqueta') {
    return arista.label === undefined ? undefined : cajaDeEtiqueta(arista.label, puntos, geometria.labels?.[elemento.id], resolverEstilo(tema, undefined, undefined, undefined, vista.type));
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
  const deSecuencia = elementoDeSecuencia(vista, id);
  if (deSecuencia !== undefined) return deSecuencia;
  if (vista.edges.some((arista) => idDeArista(arista) === id)) return { tipo: 'arista', id };
  return { tipo: id.includes('#') ? 'atributo' : 'nodo', id };
}

function itemsAplanados(items: readonly ItemResuelto[]): ItemResuelto[] {
  return items.flatMap((item) => (item.type === 'fragment' ? [item, ...item.operands.flatMap((o) => itemsAplanados(o.items))] : [item]));
}

/** Mensaje, Fragmento (o `ref`) o Nota que nombra `interaccion:ruta` en una Vista de secuencia. */
function elementoDeSecuencia(vista: VistaResuelta, id: string): ElementoSeleccionable | undefined {
  const interaccion = vista.interaction;
  if (interaccion === undefined || !id.startsWith(`${interaccion.id}:`)) return undefined;
  const ruta = id.slice(interaccion.id.length + 1);
  const item = itemsAplanados(interaccion.items).find((i) => (i.type === 'message' ? i.message.ruta : i.ruta) === ruta);
  if (item === undefined) return undefined;
  return { tipo: item.type === 'message' ? 'mensaje' : item.type === 'note' ? 'nota' : 'fragmento', id };
}

/**
 * Vista a la que navega pulsar el `ref` `id` (`interaccion:ruta`): la primera Vista de secuencia que proyecta la Interaccion
 * referida (`destinoDeRef`). `undefined` si `id` no es un `ref`, no hay Vista destino o esa Vista es la actual (inerte, sin aviso).
 */
export function destinoDeNavegacionPorRef(vista: VistaResuelta, actual: string, vistas: readonly Pick<Vista, 'id' | 'type' | 'interaction'>[], id: string): string | undefined {
  const interaccion = vista.interaction;
  if (interaccion === undefined || !id.startsWith(`${interaccion.id}:`)) return undefined;
  const ruta = id.slice(interaccion.id.length + 1);
  const item = itemsAplanados(interaccion.items).find((i) => i.type === 'ref' && i.ruta === ruta);
  if (item === undefined || item.type !== 'ref') return undefined;
  const destino = destinoDeRef(vistas, item.interaction);
  return destino === actual ? undefined : destino;
}
