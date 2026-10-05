/**
 * Resolucion de Vistas: que Nodos y Aristas muestra una Vista del Modelo.
 * Pura: no modifica la Fuente. Una Vista solo selecciona, nunca define entidades.
 */
import type { Arista, Extremo, FuenteCanonica, Nodo, OverrideDeNodo, Paso, Vista } from './esquema';

/** Nodo visible: un Grupo colapsado se muestra como un Nodo unico con su contador. */
export interface NodoResuelto extends Omit<Nodo, 'children'> {
  /** Solo los hijos visibles; vacio en un Grupo colapsado. */
  children: NodoResuelto[];
  /** El Grupo se muestra cerrado. Un Nodo sin hijos nunca esta colapsado. */
  collapsed: boolean;
  /** Hijos directos del Nodo en el Modelo (visibles o no). */
  childCount: number;
  /** Vista a la que enlaza (drill-down); un Grupo con `link` no se expande. */
  link?: string;
}

/** Arista visible; `count` es cuantas Aristas del Modelo representa (mas de una si se fusionaron). */
export interface AristaResuelta extends Arista {
  count: number;
}

/** Nodos y Aristas visibles de una Vista, mas lo que `layout` y `render` necesitan de ella. */
export interface VistaResuelta {
  /** Nodos visibles en orden de documento. */
  nodes: NodoResuelto[];
  /** Aristas entre Nodos visibles, con las de los hijos de un Grupo colapsado elevadas a el. */
  edges: AristaResuelta[];
  /** Overrides de presentacion de la Vista, tal cual (label, pin, order, color). */
  overrides: OverrideDeNodo[];
  /** Pasos de revelado de la Vista (ADR 0007), tal cual; `revealAt` los interpreta. */
  steps: Paso[];
}

/** Estado de colapso del llamador (p. ej. el shell); gana a lo declarado en la Vista. */
export interface EstadoDeColapso {
  expanded?: readonly string[];
  collapsed?: readonly string[];
}

/**
 * Resuelve la Vista `viewId`: `include` (`a` un Nodo, `a.*` hijos directos,
 * `a.**` descendientes, `*` raices, `**` todo), menos `exclude`. Devuelve
 * `undefined` si la Vista no existe. Los selectores que no coinciden con ningun
 * Nodo no dan error, y `exclude` no arrastra a los descendientes del Nodo excluido.
 *
 * Colapso: un Grupo (Nodo con hijos) esta colapsado si tiene `link`; si no, por
 * precedencia, segun `estado`, luego `collapsed`/`expanded` de la Vista y luego
 * `depth` (el Grupo de nivel >= `depth` abre colapsado; las raices son el nivel
 * 1). Un Nodo bajo un Grupo colapsado no es visible, y las Aristas de sus
 * descendientes se elevan al Grupo y se fusionan por par de extremos (se pierde
 * el Atributo del extremo elevado; las internas al Grupo desaparecen).
 * `depth 0` no muestra nada.
 */
export function resolveView(
  fuente: FuenteCanonica,
  viewId: string,
  estado: EstadoDeColapso = {},
): VistaResuelta | undefined {
  const vista = fuente.views.find((candidata) => candidata.id === viewId);
  if (vista === undefined) return undefined;

  const todos = aplanar(fuente.model.nodes);
  const seleccionados = (selectores: readonly string[]): Set<string> =>
    new Set(todos.filter((nodo) => selectores.some((selector) => matchesSelector(selector, nodo.id))).map((nodo) => nodo.id));
  const incluidos = seleccionados(vista.include);
  const excluidos = seleccionados(vista.exclude);

  const colapsado = (nodo: Nodo): boolean => estaColapsado(nodo, vista, estado);
  const ancestroColapsado = new Map<string, string>();
  const registrar = (nodos: readonly Nodo[], heredado: string | undefined): void => {
    for (const nodo of nodos) {
      if (heredado !== undefined) ancestroColapsado.set(nodo.id, heredado);
      registrar(nodo.children, heredado ?? (colapsado(nodo) ? nodo.id : undefined));
    }
  };
  registrar(fuente.model.nodes, undefined);

  const visibles = new Set(
    todos
      .map((nodo) => nodo.id)
      .filter((id) => incluidos.has(id) && !excluidos.has(id) && !ancestroColapsado.has(id) && vista.depth !== 0),
  );
  const enlaces = new Map(vista.links.map(({ node, view }) => [node, view]));
  const resolver = (nodo: Nodo): NodoResuelto => {
    const { children, ...resto } = nodo;
    const enlace = enlaces.get(nodo.id);
    return {
      ...resto,
      children: children.filter((hijo) => visibles.has(hijo.id)).map(resolver),
      collapsed: colapsado(nodo),
      childCount: children.length,
      ...(enlace !== undefined && { link: enlace }),
    };
  };

  return {
    nodes: todos.filter((nodo) => visibles.has(nodo.id)).map(resolver),
    edges: elevarAristas(fuente.model.edges, visibles, ancestroColapsado),
    overrides: vista.overrides,
    steps: vista.steps,
  };
}

/** Un Nodo sin hijos nunca esta colapsado; un Grupo con `link` siempre lo esta. */
function estaColapsado(nodo: Nodo, vista: Vista, estado: EstadoDeColapso): boolean {
  if (nodo.children.length === 0) return false;
  if (vista.links.some((enlace) => enlace.node === nodo.id)) return true;
  if (estado.expanded?.includes(nodo.id)) return false;
  if (estado.collapsed?.includes(nodo.id)) return true;
  if (vista.expanded.includes(nodo.id)) return false;
  if (vista.collapsed.includes(nodo.id)) return true;
  return vista.depth !== undefined && nivel(nodo.id) >= vista.depth;
}

/**
 * Aristas entre Nodos visibles. Un extremo dentro de un Grupo colapsado pasa a
 * ser el Grupo; las que quedan con ambos extremos iguales se descartan y las
 * que repiten par se fusionan sumando `count`.
 */
function elevarAristas(
  aristas: readonly Arista[],
  visibles: ReadonlySet<string>,
  ancestroColapsado: ReadonlyMap<string, string>,
): AristaResuelta[] {
  const fusionadas = new Map<string, AristaResuelta>();
  for (const arista of aristas) {
    const from = elevar(arista.from, ancestroColapsado);
    const to = elevar(arista.to, ancestroColapsado);
    if (!visibles.has(from.node) || !visibles.has(to.node)) continue;
    if (from.node === to.node && (from !== arista.from || to !== arista.to)) continue;

    const clave = JSON.stringify([from, to]);
    const previa = fusionadas.get(clave);
    if (previa === undefined) {
      fusionadas.set(clave, { ...arista, from, to, count: 1 });
    } else {
      const { fromCardinality, toCardinality, ...sinCardinalidad } = previa;
      fusionadas.set(clave, { ...sinCardinalidad, count: previa.count + 1 });
    }
  }
  return [...fusionadas.values()];
}

function elevar(extremo: Extremo, ancestroColapsado: ReadonlyMap<string, string>): Extremo {
  const grupo = ancestroColapsado.get(extremo.node);
  return grupo === undefined ? extremo : { node: grupo };
}

/** Todos los Nodos a cualquier profundidad, en orden de documento. */
function aplanar(nodos: readonly Nodo[]): Nodo[] {
  return nodos.flatMap((nodo) => [nodo, ...aplanar(nodo.children)]);
}

function nivel(id: string): number {
  return id.split('.').length;
}

/** Si el id cae dentro de lo que designa el selector (`a`, `a.*`, `a.**`, `*`, `**`). */
export function matchesSelector(selector: string, id: string): boolean {
  if (selector === '**') return true;
  if (selector === '*') return nivel(id) === 1;
  if (selector.endsWith('.**')) return id.startsWith(selector.slice(0, -2));
  if (selector.endsWith('.*')) {
    const prefijo = selector.slice(0, -1);
    return id.startsWith(prefijo) && nivel(id) === nivel(selector);
  }
  return id === selector;
}
