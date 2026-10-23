/**
 * Layout de una Vista resuelta con ELK (ADR 0003): `INCLUDE_CHILDREN`, sin
 * `considerModelOrder` (enmienda del ADR, benchmark #13).
 */
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import { idDeArista } from 'canonico';
import type { NodoResuelto, Tema, VistaResuelta } from 'canonico';

import { indiceDeGeometria } from './indice';
import { atributosVisibles, metricasDe, tamanoDeEtiqueta, tamanoDeNodo, yDeFila } from './metricas';
import type { Metricas } from './metricas';

/** Caja de un Nodo: `x`/`y` relativos a su Grupo padre (al lienzo si es raiz). */
export interface CajaDeNodo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Punto {
  x: number;
  y: number;
}

/**
 * Ruta ortogonal de una Arista, en coordenadas del lienzo (no relativas a un
 * Grupo). El primer y el ultimo punto son los puertos: caen en el borde de los
 * Nodos extremo (el Grupo, si esta colapsado).
 */
export interface RutaDeArista {
  points: Punto[];
}

/** Geometria calculada de una Vista: cajas por id de Nodo visible y rutas por `idDeArista`. */
export interface Geometria {
  nodes: Record<string, CajaDeNodo>;
  edges: Record<string, RutaDeArista>;
  /** Caja (coordenadas del lienzo) que ELK reservo a la etiqueta de cada Arista que la tiene, por `idDeArista`. */
  labels: Record<string, CajaDeNodo>;
  /** Pares de ids (orden alfabetico) de Nodos pineados cuyas cajas se solapan; el aviso `W_OVERLAPPING_PINS` lo emite quien tiene las posiciones del texto. */
  pinsSolapados: [string, string][];
  width: number;
  height: number;
}

export interface OpcionesDeLayout {
  /** Motor ELK; por defecto el empaquetado, que corre igual en Node y en Web Worker. */
  elk?: ELK;
  /** Metricas con las que medir; por defecto las derivadas del Tema. `render` debe dibujar con las mismas. */
  metricas?: Metricas;
}

/** Margen interior de un Grupo; arriba deja sitio al titulo. */
const PADDING_GRUPO = '[top=32,left=16,bottom=16,right=16]';

const OPCIONES_RAIZ = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.edgeCoords': 'ROOT',
  'elk.json.shapeCoords': 'PARENT',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  // Esfuerzo de minimizacion de cruces: 1 (el minimo) reduce a la mitad el relayout de 1k Nodos (ADR 0003, enmienda).
  'elk.layered.thoroughness': '1',
};

/**
 * Calcula la Geometria de `vista` con las medidas del `tema`. Determinista: la
 * misma entrada da la misma geometria. Los Grupos cerrados son Nodos hoja.
 * Sin `opciones.elk` crea un motor por llamada (unos ms; sin estado compartido).
 */
export async function layoutView(
  vista: VistaResuelta,
  tema: Tema,
  opciones: OpcionesDeLayout = {},
): Promise<Geometria> {
  // Import dinamico: quien solo usa las medidas (render) no arrastra ELK al empaquetar.
  const elk = opciones.elk ?? new (await import('elkjs/lib/elk.bundled.js')).default();
  const medidas = opciones.metricas ?? metricasDe(tema);

  const grafo: ElkNode = {
    id: 'raiz',
    layoutOptions: OPCIONES_RAIZ,
    children: indiceDeGeometria(vista, { nodes: {} }).raices.map((nodo) => aElk(nodo, medidas)),
    edges: vista.edges.map((arista) => ({
      id: idDeArista(arista),
      sources: [arista.from.node],
      targets: [arista.to.node],
      ...(arista.label !== undefined && { labels: [{ id: `${idDeArista(arista)}:etiqueta`, text: arista.label, ...tamanoDeEtiqueta(arista.label, medidas) }] }),
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
  return conPinsYPuertos(vista, medidas, { nodes, edges, labels, pinsSolapados: [], width: resultado.width ?? 0, height: resultado.height ?? 0 });
}

function conPinsYPuertos(vista: VistaResuelta, medidas: Metricas, base: Geometria): Geometria {
  const pinneada = aplicarPins(vista, base.nodes, base.edges, base.labels);
  const conPuertos = { ...pinneada, edges: ajustarAPuertosDeAtributo(vista, medidas, pinneada.nodes, pinneada.edges) };
  return { ...conPuertos, width: base.width, height: base.height };
}

/**
 * Aplica los Pins de `vista` a `base`, la geometria de la misma estructura calculada sin Pins
 * (`layoutView` de la Vista sin overrides de Pin). Es el paso post-ELK de `layoutView` y da el mismo
 * resultado que un layout completo, sin volver a ejecutar ELK: mover un Pin no relayouta.
 */
export function aplicarPinsAGeometria(vista: VistaResuelta, base: Geometria, tema: Tema, metricas: Metricas = metricasDe(tema)): Geometria {
  return conPinsYPuertos(vista, metricas, base);
}

/**
 * Pin post-ELK (ADR 0003): la caja del Nodo pineado pasa a `pin`, relativa a su
 * Grupo padre. De las Aristas, solo cambian las que tocan el subarbol movido: si
 * los dos extremos van dentro del mismo subarbol pineado se trasladan con el; si
 * no, se re-enrutan con una ruta en Z sencilla entre las cajas (pierden la ruta
 * de ELK). Un Pin sobre un Nodo que la Vista no muestra se ignora (`validate` ya
 * lo informa). No muta sus argumentos. `pinsSolapados` son los pares de Nodos
 * pineados cuyas cajas se solapan, salvo ancestro y descendiente. La etiqueta de
 * una Arista trasladada va con ella; la de una re-enrutada se descarta (`render`
 * la pone sobre la nueva ruta).
 */
function aplicarPins(
  vista: VistaResuelta,
  nodes: Record<string, CajaDeNodo>,
  edges: Record<string, RutaDeArista>,
  labels: Record<string, CajaDeNodo>,
): Pick<Geometria, 'nodes' | 'edges' | 'labels' | 'pinsSolapados'> {
  const pins = vista.overrides.filter((o) => o.pin !== undefined && nodes[o.node] !== undefined);
  if (pins.length === 0) return { nodes, edges, labels, pinsSolapados: [] };
  const nuevos: Record<string, CajaDeNodo> = { ...nodes };
  for (const { node, pin } of pins) nuevos[node] = { ...nuevos[node]!, ...pin };
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
 * Una Arista a `nodo#atributo` termina en la fila de ese Atributo: el puerto
 * sube o baja a su altura sobre el borde del Nodo (la ruta de ELK apunta al
 * centro). Solo se ajusta un tramo final horizontal; si la ruta no tiene codo
 * previo se inserta uno a mitad de camino.
 */
function ajustarAPuertosDeAtributo(
  vista: VistaResuelta,
  metricas: Metricas,
  nodes: Record<string, CajaDeNodo>,
  edges: Record<string, RutaDeArista>,
): Record<string, RutaDeArista> {
  const atributos = new Map(vista.nodes.map((nodo) => [nodo.id, atributosVisibles(nodo)]));
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
      const y = cajas.get(extremo.node)!.y + yDeFila(metricas, indice);
      puntos = moverPuerto(puntos, lado, y);
    }
    rutas[id] = { points: puntos };
  }
  return rutas;
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

/** Ruta en Z entre los bordes de dos cajas: horizontal si estan separadas en x, si no vertical; con cajas encimadas, tambien horizontal (los puertos siguen en el borde, la ruta puede cruzar las cajas). */
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

function aElk(nodo: NodoResuelto, medidas: Metricas): ElkNode {
  if (nodo.children.length === 0) {
    return { id: nodo.id, ...tamanoDeNodo(nodo.label, medidas, atributosVisibles(nodo)) };
  }
  return {
    id: nodo.id,
    layoutOptions: { 'elk.padding': paddingElk(medidas.paddingGrupo) },
    children: nodo.children.map((hijo) => aElk(hijo, medidas)),
  };
}

/**
 * Clave de cache de la geometria: igual si y solo si el layout no cambia. Entran
 * la estructura visible, los textos, los Pins y las Metricas (fuentes, tamanos y espaciado); no la
 * paleta, los colores ni los iconos, que no mueven nada. Es la unica respuesta a
 * "esta geometria sigue vigente?" para `sesion`, `cli` y `shell`.
 */
export function claveDeLayout(vista: VistaResuelta, tema: Tema, metricas: Metricas = metricasDe(tema)): string {
  return JSON.stringify({ estructura: claveDeEstructura(vista, tema, metricas), pins: pinsDe(vista) });
}

const pinsDe = (vista: VistaResuelta) => vista.overrides.flatMap((o) => (o.pin === undefined ? [] : [[o.node, o.pin.x, o.pin.y]]));

/**
 * Como `claveDeLayout` sin los Pins: identifica la geometria que ELK calcula (los Pins se aplican despues,
 * `aplicarPinsAGeometria`). Mover un Pin no la cambia, asi que no exige relayout de ELK.
 */
export function claveDeEstructura(vista: VistaResuelta, tema: Tema, metricas: Metricas = metricasDe(tema)): string {
  return JSON.stringify({
    nodos: vista.nodes.map((nodo) => [nodo.id, nodo.label, nodo.collapsed, nodo.children.map((hijo) => hijo.id)]),
    aristas: vista.edges.map((arista) => [idDeArista(arista), arista.label]),
    metricas,
  });
}
