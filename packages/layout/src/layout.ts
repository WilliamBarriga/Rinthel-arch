/**
 * Layout de una Vista resuelta con ELK (ADR 0004): `INCLUDE_CHILDREN`, sin
 * `considerModelOrder` (enmienda del ADR, benchmark #13).
 */
import ELKBundled from 'elkjs/lib/elk.bundled.js';
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import { idDeArista } from 'canonico';
import type { NodoResuelto, Tema, VistaResuelta } from 'canonico';

import { medidasDeTexto, tamanoDeNodo, textoDelNodo } from './medidas';
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
  const labels = labelsDeVista(vista);

  const grafo: ElkNode = {
    id: 'raiz',
    layoutOptions: OPCIONES_RAIZ,
    children: raices(vista).map((nodo) => aElk(nodo, medidas, labels)),
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
  return { nodes, edges, width: resultado.width ?? 0, height: resultado.height ?? 0 };
}

/** `resolveView` lista todos los Nodos visibles a plano y anida ademas los hijos: las raices son las que nadie anida. */
function raices(vista: VistaResuelta): NodoResuelto[] {
  const anidados = new Set(vista.nodes.flatMap((nodo) => nodo.children.map((hijo) => hijo.id)));
  return vista.nodes.filter((nodo) => !anidados.has(nodo.id));
}

function aElk(nodo: NodoResuelto, medidas: MedidasDeTexto, labels: ReadonlyMap<string, string>): ElkNode {
  if (nodo.children.length === 0) {
    return { id: nodo.id, ...tamanoDeNodo(textoDelNodo(nodo, labels), medidas) };
  }
  return {
    id: nodo.id,
    layoutOptions: { 'elk.padding': PADDING_GRUPO },
    children: nodo.children.map((hijo) => aElk(hijo, medidas, labels)),
  };
}

function labelsDeVista(vista: VistaResuelta): Map<string, string> {
  return new Map(vista.overrides.flatMap(({ node, label }) => (label === undefined ? [] : [[node, label] as const])));
}

/**
 * Clave de cache de la geometria: igual si y solo si el layout no cambia. Entran
 * la estructura visible, los textos y las fuentes del Tema; no la paleta, los
 * colores ni los iconos, que no mueven nada.
 */
export function claveDeLayout(vista: VistaResuelta, tema: Tema): string {
  const medidas = medidasDeTexto(tema);
  const labels = labelsDeVista(vista);
  return JSON.stringify({
    nodos: vista.nodes.map((nodo) => [nodo.id, textoDelNodo(nodo, labels), nodo.collapsed, nodo.children.map((hijo) => hijo.id)]),
    aristas: vista.edges.map(idDeArista),
    fuentes: [medidas.fontSize, medidas.factorDeAncho, medidas.fuentes],
  });
}
