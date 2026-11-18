/** Layout de una Vista de grafo con ELK: `INCLUDE_CHILDREN`, sin `considerModelOrder`. */
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import { idDeArista } from 'canonico';
import type { CajaDeNodo, Geometria, GeometriaGrafo, ItemResuelto, NodoResuelto, OverrideDeNodo, Punto, RutaDeArista, Tema, VistaDeGrafo, VistaResuelta } from 'canonico';

import { indiceDeGeometria } from './indice';
import { layoutSecuencia } from './secuencia';
import { LARGO_DE_MARCADOR_ER, atributosVisibles, claveDeMetricas, colocarEnCaja, colocarNodo, contenidoDeNodo, comoTabla, metricasDeHoja, tablaDeMetricas, tamanoDeEtiqueta } from 'tema';
import type { MedidasDeTexto, Metricas, TablaDeMetricas } from 'tema';

export type { CajaDeNodo, Geometria, GeometriaGrafo, Punto, RutaDeArista };

export interface OpcionesDeLayout {
  /** Por defecto el empaquetado, que corre igual en Node y en Web Worker. */
  elk?: ELK;
  /** Por defecto la tabla derivada del Tema; una sola `Metricas` vale para todo elemento. `render` debe dibujar con las mismas. */
  metricas?: Metricas | TablaDeMetricas;
  /** Sin ellas el texto se estima por caracter. Se ignoran si se pasa `metricas`. */
  medidas?: MedidasDeTexto;
}

const OPCIONES_RAIZ = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.edgeCoords': 'ROOT',
  'elk.json.shapeCoords': 'PARENT',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  // 1 (el minimo) reduce a la mitad el relayout de 1k Nodos.
  'elk.layered.thoroughness': '1',
};

/**
 * Determinista. Los Grupos cerrados son Nodos hoja. Sin `opciones.elk` crea un motor por llamada.
 * Rechaza si ELK falla.
 */
export async function layoutView(
  vista: VistaResuelta,
  tema: Tema,
  opciones: OpcionesDeLayout = {},
): Promise<Geometria> {
  return layoutConMetricas(vista, opciones.metricas ?? tablaDeMetricas(tema, vista.type, opciones.medidas), opciones);
}

/** `layoutView` sobre Metricas ya resueltas, sin el Tema: es lo que corre el Worker, que no empaqueta el esquema del Tema. */
export async function layoutConMetricas(
  vista: VistaResuelta,
  metricas: Metricas | TablaDeMetricas,
  opciones: { elk?: ELK } = {},
): Promise<Geometria> {
  switch (vista.type) {
    case 'architecture':
    case 'flow':
    case 'er':
      return layoutGrafo(vista, metricas, opciones);
    case 'sequence':
      return layoutSecuencia(vista, metricas);
  }
}

async function layoutGrafo(
  vista: VistaDeGrafo,
  metricas: Metricas | TablaDeMetricas,
  opciones: { elk?: ELK },
): Promise<GeometriaGrafo> {
  // Import dinamico: quien solo usa las medidas (render) no arrastra ELK al empaquetar.
  const elk = opciones.elk ?? new (await import('elkjs/lib/elk.bundled.js')).default();
  const medidas = comoTabla(metricas);

  const grafo: ElkNode = {
    id: 'raiz',
    layoutOptions: OPCIONES_RAIZ,
    children: indiceDeGeometria(vista, { nodes: {} }).raices.map((nodo) => aElk(nodo, medidas)),
    edges: vista.edges.map((arista) => ({
      id: idDeArista(arista),
      sources: [arista.from.node],
      targets: [arista.to.node],
      ...(arista.label !== undefined && { labels: [{ id: `${idDeArista(arista)}:etiqueta`, text: arista.label, ...tamanoDeEtiqueta(arista.label, medidas.etiqueta) }] }),
    })),
  };
  const resultado = await elk.layout(grafo);

  const nodes: Record<string, CajaDeNodo> = {};
  const recoger = (hijos: readonly ElkNode[] | undefined): void => {
    for (const hijo of hijos ?? []) {
      nodes[hijo.id] = { x: hijo.x ?? 0, y: hijo.y ?? 0, width: hijo.width ?? 0, height: hijo.height ?? 0 };
      recoger(hijo.children);
    }
  };
  recoger(resultado.children);
  const edges: Record<string, RutaDeArista> = {};
  const labels: Record<string, CajaDeNodo> = {};
  for (const arista of resultado.edges ?? []) {
    const [seccion] = arista.sections ?? [];
    if (seccion === undefined) continue;
    const [etiqueta] = arista.labels ?? [];
    if (etiqueta !== undefined) labels[arista.id] = { x: etiqueta.x ?? 0, y: etiqueta.y ?? 0, width: etiqueta.width ?? 0, height: etiqueta.height ?? 0 };
    edges[arista.id] = { points: [seccion.startPoint, ...(seccion.bendPoints ?? []), seccion.endPoint].map(({ x, y }) => ({ x, y })) };
  }
  return conPinsYPuertos(vista, medidas, { kind: 'grafo', nodes, edges, labels, pinsSolapados: [], width: resultado.width ?? 0, height: resultado.height ?? 0 });
}

function conPinsYPuertos(vista: VistaDeGrafo, medidas: TablaDeMetricas, base: GeometriaGrafo): GeometriaGrafo {
  const pinneada = aplicarPins(vista, base.nodes, base.edges, base.labels);
  const conPuertos = { ...pinneada, edges: ajustarAPuertosDeAtributo(vista, medidas, pinneada.nodes, pinneada.edges) };
  // ER: el pie de gallo necesita un tramo final horizontal de al menos su largo; se garantiza tras puertos y Pins.
  if (vista.type === 'er') conPuertos.edges = garantizarTramosFinalesEr(vista, indiceDeGeometria(vista, { nodes: conPuertos.nodes }).cajas, conPuertos.edges);
  return { ...conPuertos, kind: 'grafo', nodes: conSlots(vista, medidas, conPuertos.nodes), width: base.width, height: base.height };
}

/** Anade a cada Nodo hoja el rectangulo de sus Slots, el mismo que usa `render` para pintar. */
function conSlots(vista: VistaResuelta, medidas: TablaDeMetricas, nodes: Record<string, CajaDeNodo>): Record<string, CajaDeNodo> {
  const resultado = { ...nodes };
  for (const nodo of vista.nodes) {
    const caja = resultado[nodo.id];
    if (nodo.children.length === 0 && caja !== undefined) {
      const m = metricasDeHoja(medidas, nodo);
      resultado[nodo.id] = { ...caja, slots: colocarEnCaja(m, contenidoDeNodo(nodo, m), caja.width).slots };
    }
  }
  return resultado;
}

/**
 * Aplica los Pins de `vista` a `base`, la geometria de la misma estructura calculada sin Pins. Da el mismo
 * resultado que `layoutView` sin volver a ejecutar ELK.
 */
export function aplicarPinsAGeometria(vista: VistaResuelta, base: Geometria, tema: Tema, metricas: Metricas | TablaDeMetricas = tablaDeMetricas(tema, vista.type)): Geometria {
  switch (vista.type) {
    case 'sequence':
      // La Geometria de secuencia sale completa de su layout: no hay paso post-layout.
      return base;
    case 'architecture':
    case 'flow':
    case 'er':
      return base.kind === 'grafo' ? conPinsYPuertos(vista, comoTabla(metricas), base) : base;
  }
}

/**
 * El centro de la caja del Nodo pineado pasa a `pin`, relativo a su Grupo padre. Una Arista con ambos extremos
 * en el subarbol movido se traslada con su etiqueta; una que lo cruza se re-enruta en Z y pierde la etiqueta
 * (`render` la pone sobre la nueva ruta). Un Pin sobre un Nodo ausente se ignora. No muta sus argumentos.
 * `pinsSolapados`: pares de Nodos pineados cuyas cajas se solapan, salvo ancestro y descendiente.
 */
function aplicarPins(
  vista: VistaDeGrafo,
  nodes: Record<string, CajaDeNodo>,
  edges: Record<string, RutaDeArista>,
  labels: Record<string, CajaDeNodo>,
): Pick<GeometriaGrafo, 'nodes' | 'edges' | 'labels' | 'pinsSolapados'> {
  const pins = pinsDe(vista).filter((o) => nodes[o.node] !== undefined);
  if (pins.length === 0) return { nodes, edges, labels, pinsSolapados: [] };
  const nuevos: Record<string, CajaDeNodo> = { ...nodes };
  for (const { node, pin } of pins) {
    const caja = nuevos[node]!;
    nuevos[node] = { ...caja, x: pin.x - caja.width / 2, y: pin.y - caja.height / 2 };
  }
  const previo = indiceDeGeometria(vista, { nodes });
  const indice = indiceDeGeometria(vista, { nodes: nuevos });
  const { padre } = indice;
  const dentroDe = (id: string, raiz: string): boolean => id === raiz || (padre.has(id) && dentroDe(padre.get(id)!, raiz));
  const movidos = pins.map((o) => o.node);
  const rutas: Record<string, RutaDeArista> = { ...edges };
  const etiquetas: Record<string, CajaDeNodo> = { ...labels };
  for (const arista of vista.edges) {
    const [origen, destino] = [arista.from.node, arista.to.node];
    const raizOrigen = movidos.find((m) => dentroDe(origen, m));
    const raizDestino = movidos.find((m) => dentroDe(destino, m));
    if (raizOrigen === undefined && raizDestino === undefined) continue;
    const id = idDeArista(arista);
    const previa = edges[id];
    if (raizOrigen === raizDestino && previa !== undefined) {
      const antes = previo.cajas.get(raizOrigen!)!;
      const despues = indice.cajas.get(raizOrigen!)!;
      const [dx, dy] = [despues.x - antes.x, despues.y - antes.y];
      rutas[id] = { points: previa.points.map(({ x, y }) => ({ x: x + dx, y: y + dy })) };
      const etiqueta = etiquetas[id];
      if (etiqueta !== undefined) etiquetas[id] = { ...etiqueta, x: etiqueta.x + dx, y: etiqueta.y + dy };
    } else {
      delete etiquetas[id];
      rutas[id] = { points: rutaOrtogonal(indice.cajas.get(origen)!, indice.cajas.get(destino)!) };
    }
  }

  const pinsSolapados: [string, string][] = [];
  const ids = [...new Set(movidos)].sort();
  ids.forEach((a, i) => {
    for (const b of ids.slice(i + 1)) {
      if (dentroDe(a, b) || dentroDe(b, a)) continue;
      if (seSolapan(indice.cajas.get(a)!, indice.cajas.get(b)!)) pinsSolapados.push([a, b]);
    }
  });
  return { nodes: nuevos, edges: rutas, labels: etiquetas, pinsSolapados };
}

/**
 * Una Arista a `nodo#atributo` termina en la fila de ese Atributo (ELK apunta al centro del Nodo). Solo se
 * ajusta un tramo final horizontal; si la ruta no tiene codo previo se inserta uno a mitad de camino.
 */
function ajustarAPuertosDeAtributo(
  vista: VistaDeGrafo,
  tabla: TablaDeMetricas,
  nodes: Record<string, CajaDeNodo>,
  edges: Record<string, RutaDeArista>,
): Record<string, RutaDeArista> {
  const atributos = new Map(vista.nodes.map((nodo) => [nodo.id, atributosVisibles(nodo, metricasDeHoja(tabla, nodo))]));
  const { cajas } = indiceDeGeometria(vista, { nodes });
  const rutas = { ...edges };
  for (const arista of vista.edges) {
    const id = idDeArista(arista);
    const ruta = rutas[id];
    if (ruta === undefined) continue;
    let puntos = ruta.points;
    for (const [lado, extremo] of [['inicio', arista.from], ['fin', arista.to]] as const) {
      const indice = extremo.attribute === undefined ? -1 : (atributos.get(extremo.node) ?? []).findIndex((a) => a.name === extremo.attribute);
      if (indice < 0) continue;
      const dueno = vista.nodes.find((n) => n.id === extremo.node)!;
      const m = metricasDeHoja(tabla, dueno);
      const fila = colocarEnCaja(m, contenidoDeNodo(dueno, m), cajas.get(extremo.node)!.width).filas[indice]!;
      const y = cajas.get(extremo.node)!.y + fila.y + fila.height / 2;
      puntos = moverPuerto(puntos, lado, y);
    }
    rutas[id] = { points: puntos };
  }
  return rutas;
}

/**
 * Cada extremo de una Arista ER acaba en un tramo horizontal de al menos `LARGO_DE_MARCADOR_ER`, para que el
 * marcador de cardinalidad no se monte sobre el codo. Un extremo vertical pasa al lado del Nodo mas cercano a la ruta.
 */
function garantizarTramosFinalesEr(vista: VistaDeGrafo, cajas: ReadonlyMap<string, CajaDeNodo>, edges: Record<string, RutaDeArista>): Record<string, RutaDeArista> {
  const rutas = { ...edges };
  for (const arista of vista.edges) {
    const id = idDeArista(arista);
    const ruta = rutas[id];
    const [origen, destino] = [cajas.get(arista.from.node), cajas.get(arista.to.node)];
    if (ruta === undefined || ruta.points.length < 2 || origen === undefined || destino === undefined) continue;
    let puntos = ruta.points;
    // Una ruta de dos puntos se parte antes: los dos extremos piden su tramo y se reparten el recorrido.
    if (puntos.length === 2) {
      const [a, b] = [puntos[0]!, puntos[1]!];
      const medio = (a.x + b.x) / 2;
      puntos = [a, { x: medio, y: a.y }, { x: medio, y: b.y }, b];
    }
    puntos = tramoFinal(puntos, origen, 'inicio');
    puntos = tramoFinal(puntos, destino, 'fin');
    rutas[id] = { points: puntos };
  }
  return rutas;
}

function tramoFinal(puntos: Punto[], caja: CajaDeNodo, lado: 'inicio' | 'fin'): Punto[] {
  const p = lado === 'inicio' ? [...puntos] : [...puntos].reverse();
  // `p[0]` es el puerto, `p[1]` el codo previo.
  let [puerto, codo] = [p[0]!, p[1]!];
  if (puerto.y !== codo.y) {
    // Llega en vertical: el puerto pasa al borde lateral del Nodo del lado de la ruta, a la altura del codo (acotada al Nodo).
    const derecha = codo.x >= caja.x + caja.width / 2;
    const y = Math.min(Math.max(puerto.y, caja.y + 1), caja.y + caja.height - 1);
    puerto = { x: derecha ? caja.x + caja.width : caja.x, y };
    p.splice(0, 2, puerto, { x: codo.x, y }, codo);
    codo = p[1]!;
  }
  const hacia = Math.sign(codo.x - puerto.x) || (puerto.x <= caja.x + caja.width / 2 ? -1 : 1);
  if (Math.abs(codo.x - puerto.x) < LARGO_DE_MARCADOR_ER || Math.sign(codo.x - puerto.x) !== hacia) {
    const x = puerto.x + hacia * LARGO_DE_MARCADOR_ER;
    const siguiente = p[2];
    // Si el tramo que sale del codo es vertical se desplaza con el; si no, se anade uno vertical.
    if (siguiente !== undefined && siguiente.x === codo.x) {
      p[1] = { x, y: codo.y };
      p[2] = { x, y: siguiente.y };
    } else if (siguiente === undefined) {
      p[1] = { x, y: codo.y };
    } else {
      p.splice(1, 1, { x, y: codo.y }, { x, y: siguiente.y });
    }
  }
  return lado === 'inicio' ? p : p.reverse();
}

function moverPuerto(puntos: Punto[], lado: 'inicio' | 'fin', y: number): Punto[] {
  const copia = lado === 'inicio' ? [...puntos].reverse() : [...puntos];
  const fin = copia[copia.length - 1]!;
  const previo = copia[copia.length - 2]!;
  if (previo.y !== fin.y || fin.y === y) return puntos;
  const antes = copia[copia.length - 3];
  if (antes === undefined) {
    const medio = (previo.x + fin.x) / 2;
    copia.splice(1, 0, { x: medio, y: previo.y }, { x: medio, y });
  } else if (antes.y === previo.y) {
    // Tramo previo tambien horizontal: un codo nuevo evita dejarlo en diagonal.
    copia.splice(copia.length - 1, 0, { x: previo.x, y });
  } else {
    copia[copia.length - 2] = { x: previo.x, y };
  }
  copia[copia.length - 1] = { x: fin.x, y };
  return lado === 'inicio' ? copia.reverse() : copia;
}

function seSolapan(a: CajaDeNodo, b: CajaDeNodo): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Ruta en Z entre los bordes de dos cajas: horizontal si estan separadas en x o encimadas, si no vertical. */
function rutaOrtogonal(origen: CajaDeNodo, destino: CajaDeNodo): Punto[] {
  const centro = (c: CajaDeNodo): Punto => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const [o, d] = [centro(origen), centro(destino)];
  if (seSolapan(origen, destino) || origen.x + origen.width <= destino.x || destino.x + destino.width <= origen.x) {
    const derecha = d.x >= o.x;
    const salida = derecha ? origen.x + origen.width : origen.x;
    const entrada = derecha ? destino.x : destino.x + destino.width;
    const medio = (salida + entrada) / 2;
    return [{ x: salida, y: o.y }, { x: medio, y: o.y }, { x: medio, y: d.y }, { x: entrada, y: d.y }];
  }
  const abajo = d.y >= o.y;
  const salida = abajo ? origen.y + origen.height : origen.y;
  const entrada = abajo ? destino.y : destino.y + destino.height;
  const medio = (salida + entrada) / 2;
  return [{ x: o.x, y: salida }, { x: o.x, y: medio }, { x: d.x, y: medio }, { x: d.x, y: entrada }];
}

function paddingElk({ top, left, bottom, right }: Metricas['paddingGrupo']): string {
  return `[top=${top},left=${left},bottom=${bottom},right=${right}]`;
}

function aElk(nodo: NodoResuelto, tabla: TablaDeMetricas): ElkNode {
  if (nodo.children.length === 0) {
    const medidas = metricasDeHoja(tabla, nodo);
    const { width, height } = colocarNodo(contenidoDeNodo(nodo, medidas), medidas);
    return { id: nodo.id, width, height };
  }
  // El Grupo abierto nunca es mas angosto que su cabecera (titulo, icono y control de colapso).
  const { width } = colocarNodo(contenidoDeNodo(nodo, tabla.grupoAbierto), tabla.grupoAbierto);
  return {
    id: nodo.id,
    layoutOptions: { 'elk.padding': paddingElk(tabla.grupoAbierto.paddingGrupo), 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${width}, 0)` },
    children: nodo.children.map((hijo) => aElk(hijo, tabla)),
  };
}

/**
 * Clave de cache de la geometria: igual si y solo si el layout no cambia. Entran estructura visible, textos, Pins,
 * Metricas y si el Nodo tiene icono; no paleta ni colores.
 */
export function claveDeLayout(vista: VistaResuelta, tema: Tema, metricas: Metricas | TablaDeMetricas = tablaDeMetricas(tema, vista.type)): string {
  return JSON.stringify({ tipo: vista.type, estructura: claveDeEstructura(vista, tema, metricas), pins: pinsDe(vista).map((o) => [o.node, o.pin.x, o.pin.y]) });
}

/** Overrides con Pin de la Vista; una Vista de secuencia no tiene Pins (su orden lo da `order`). */
function pinsDe(vista: VistaResuelta): (OverrideDeNodo & { pin: NonNullable<OverrideDeNodo['pin']> })[] {
  switch (vista.type) {
    case 'sequence':
      return [];
    case 'architecture':
    case 'flow':
    case 'er':
      return vista.overrides.flatMap((o) => (o.pin === undefined ? [] : [{ ...o, pin: o.pin }]));
  }
}

/** `claveDeLayout` sin los Pins: identifica la geometria que calcula ELK. */
export function claveDeEstructura(vista: VistaResuelta, tema: Tema, metricas: Metricas | TablaDeMetricas = tablaDeMetricas(tema, vista.type)): string {
  const tabla = comoTabla(metricas);
  return JSON.stringify({
    tipo: vista.type,
    nodos: vista.nodes.map((nodo) => [nodo.id, Object.hasOwn(tabla.tipos, nodo.type) ? nodo.type : '', nodo.label, nodo.collapsed, nodo.icon !== undefined, nodo.children.map((hijo) => hijo.id), atributosVisibles(nodo, metricasDeHoja(tabla, nodo)).map((a) => (vista.type === 'er' ? [a.name, a.type, a.keys, a.optional] : [a.name, a.type]))]),
    ...claveDeConexiones(vista),
    metricas: claveDeMetricas(tabla),
  });
}

/** Lo que une a los Nodos en la clave de estructura: Aristas en un grafo; Mensajes, Fragmentos y `box` en secuencia. */
function claveDeConexiones(vista: VistaResuelta): Record<string, unknown> {
  switch (vista.type) {
    case 'sequence': {
      const { messages, items, groups } = vista.interaction;
      return {
        aristas: [],
        mensajes: messages.map((m) => [m.ruta, m.kind, m.from, m.to, m.label]),
        fragmentos: claveDeFragmentos(items),
        grupos: groups?.map((g) => [g.id, g.label, g.nivel, g.lifelines]),
      };
    }
    case 'architecture':
    case 'flow':
    case 'er':
      return { aristas: vista.edges.map((arista) => [idDeArista(arista), arista.label]) };
  }
}

/** Estructura de los Fragmentos (operador, guardas y a que Mensajes cubren) para la clave de layout. */
function claveDeFragmentos(items: readonly ItemResuelto[]): unknown[] {
  return items.flatMap((item): unknown[] => {
    if (item.type === 'message') return [];
    if (item.type === 'note') return [[item.ruta, 'note', item.anchor, item.targets, item.text]];
    if (item.type === 'ref') return [[item.ruta, 'ref', item.title, item.participantes]];
    return [[item.ruta, item.operator, item.operands.map((o) => [o.guard, o.items.map((i) => (i.type === 'message' ? i.message.ruta : claveDeFragmentos([i])))])]];
  });
}
