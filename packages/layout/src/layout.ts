/**
 * Layout de una Vista resuelta con ELK (ADR 0004): `INCLUDE_CHILDREN`, sin
 * `considerModelOrder` (enmienda del ADR, benchmark #13).
 */
import ELKBundled from 'elkjs/lib/elk.bundled.js';
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import { idDeArista } from 'canonico';
import type { NodoResuelto, Tema, VistaResuelta } from 'canonico';

import { medidasDeTexto, tamanoDeNodo } from './medidas';
import type { MedidasDeTexto } from './medidas';

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
  /** Pares de ids (orden alfabetico) de Nodos pineados cuyas cajas se solapan; el aviso `W_OVERLAPPING_PINS` lo emite quien tiene las posiciones del texto. */
  pinsSolapados: [string, string][];
  width: number;
  height: number;
}

export interface OpcionesDeLayout {
  /** Motor ELK; por defecto el empaquetado, que corre igual en Node y en Web Worker. */
  elk?: ELK;
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
};

let elkPorDefecto: ELK | undefined;

/**
 * Calcula la Geometria de `vista` con las medidas del `tema`. Determinista: la
 * misma entrada da la misma geometria. Los Grupos cerrados son Nodos hoja.
 */
export async function layoutView(
  vista: VistaResuelta,
  tema: Tema,
  opciones: OpcionesDeLayout = {},
): Promise<Geometria> {
  const elk = opciones.elk ?? (elkPorDefecto ??= new ELKBundled());
  const medidas = medidasDeTexto(tema);

  const grafo: ElkNode = {
    id: 'raiz',
    layoutOptions: OPCIONES_RAIZ,
    children: raices(vista).map((nodo) => aElk(nodo, medidas)),
    edges: vista.edges.map((arista) => ({
      id: idDeArista(arista),
      sources: [arista.from.node],
      targets: [arista.to.node],
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
  for (const arista of resultado.edges ?? []) {
    const [seccion] = arista.sections ?? [];
    if (seccion === undefined) continue;
    edges[arista.id] = { points: [seccion.startPoint, ...(seccion.bendPoints ?? []), seccion.endPoint].map(({ x, y }) => ({ x, y })) };
  }
  const pinsSolapados = aplicarPins(vista, nodes, edges);
  return { nodes, edges, pinsSolapados, width: resultado.width ?? 0, height: resultado.height ?? 0 };
}

/**
 * Pin post-ELK (ADR 0004): la caja del Nodo pineado pasa a `pin`, relativa a su
 * Grupo padre, y solo se re-enrutan las Aristas con un extremo en el subarbol
 * movido. Un Pin sobre un Nodo que la Vista no muestra se ignora (`validate` ya
 * lo informa). Devuelve los pares de Nodos pineados que se solapan.
 */
function aplicarPins(
  vista: VistaResuelta,
  nodes: Record<string, CajaDeNodo>,
  edges: Record<string, RutaDeArista>,
): [string, string][] {
  const pins = vista.overrides.filter((o) => o.pin !== undefined && nodes[o.node] !== undefined);
  if (pins.length === 0) return [];
  const padre = new Map(vista.nodes.flatMap((nodo) => nodo.children.map((hijo) => [hijo.id, nodo.id] as const)));
  const absoluta = (id: string): CajaDeNodo => {
    const caja = nodes[id]!;
    const arriba = padre.get(id);
    if (arriba === undefined) return caja;
    const marco = absoluta(arriba);
    return { ...caja, x: marco.x + caja.x, y: marco.y + caja.y };
  };
  const dentroDe = (id: string, raiz: string): boolean => id === raiz || (padre.has(id) && dentroDe(padre.get(id)!, raiz));

  for (const { node, pin } of pins) Object.assign(nodes[node]!, pin);
  const movidos = pins.map((o) => o.node);
  for (const arista of vista.edges) {
    const extremos = [arista.from.node, arista.to.node];
    if (!extremos.some((id) => movidos.some((m) => dentroDe(id, m)))) continue;
    edges[idDeArista(arista)] = { points: rutaOrtogonal(absoluta(extremos[0]!), absoluta(extremos[1]!)) };
  }

  const solapes: [string, string][] = [];
  const ids = [...new Set(movidos)].sort();
  ids.forEach((a, i) => {
    for (const b of ids.slice(i + 1)) if (seSolapan(absoluta(a), absoluta(b))) solapes.push([a, b]);
  });
  return solapes;
}

function seSolapan(a: CajaDeNodo, b: CajaDeNodo): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Ruta en Z entre los bordes de dos cajas: horizontal si estan separadas en x, si no vertical. */
function rutaOrtogonal(origen: CajaDeNodo, destino: CajaDeNodo): Punto[] {
  const centro = (c: CajaDeNodo): Punto => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const [o, d] = [centro(origen), centro(destino)];
  if (origen.x + origen.width <= destino.x || destino.x + destino.width <= origen.x) {
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

/** `resolveView` lista todos los Nodos visibles a plano y anida ademas los hijos: las raices son las que nadie anida. */
function raices(vista: VistaResuelta): NodoResuelto[] {
  const anidados = new Set(vista.nodes.flatMap((nodo) => nodo.children.map((hijo) => hijo.id)));
  return vista.nodes.filter((nodo) => !anidados.has(nodo.id));
}

function aElk(nodo: NodoResuelto, medidas: MedidasDeTexto): ElkNode {
  if (nodo.children.length === 0) {
    return { id: nodo.id, ...tamanoDeNodo(nodo.label, medidas) };
  }
  return {
    id: nodo.id,
    layoutOptions: { 'elk.padding': PADDING_GRUPO },
    children: nodo.children.map((hijo) => aElk(hijo, medidas)),
  };
}

/**
 * Clave de cache de la geometria: igual si y solo si el layout no cambia. Entran
 * la estructura visible, los textos y las fuentes del Tema; no la paleta, los
 * colores ni los iconos, que no mueven nada.
 */
export function claveDeLayout(vista: VistaResuelta, tema: Tema): string {
  const medidas = medidasDeTexto(tema);
  return JSON.stringify({
    nodos: vista.nodes.map((nodo) => [nodo.id, nodo.label, nodo.collapsed, nodo.children.map((hijo) => hijo.id)]),
    aristas: vista.edges.map(idDeArista),
    fuentes: [medidas.fontSize, medidas.factorDeAncho, medidas.fuentes],
  });
}
