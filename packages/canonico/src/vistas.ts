/** Resolucion pura de Vistas. Una Vista solo selecciona Nodos del Modelo, nunca define entidades. */
import type { Arista, Extremo, FuenteCanonica, Nodo, OverrideDeNodo, Paso, Vista } from './esquema';
import { resolverSecuencia } from './secuencia';
import type { InteraccionResuelta } from './secuencia';

/** Nodo visible: un Grupo colapsado se muestra como un Nodo unico con su contador. */
export interface NodoResuelto extends Omit<Nodo, 'children'> {
  /** Solo los hijos visibles; vacio en un Grupo colapsado. */
  children: NodoResuelto[];
  /** Un Nodo sin hijos nunca esta colapsado. */
  collapsed: boolean;
  /** `label` del override de la Vista o, si no, `title`. */
  label: string;
  /** Nombre de Paleta: el del override de la Vista o, si no, el del Tipo de nodo. */
  color?: string;
  /** Clave opaca del Tipo de nodo; la resuelve el `IconProvider`. */
  icon?: string;
  /** Hijos directos del Nodo en el Modelo (visibles o no). */
  childCount: number;
  /** Vista a la que enlaza (drill-down); un Grupo con `link` no se expande. */
  link?: string;
}

/** Arista visible; `count` es cuantas Aristas del Modelo representa (mas de una si se fusionaron). */
export interface AristaResuelta extends Arista {
  count: number;
}

/** Paso de secuencia: corte del tiempo en el Mensaje proyectado de `ruta` `corte`, incluido. */
export interface PasoResuelto extends Paso {
  corte: string;
}

export interface VistaDeGrafo {
  /** Elige el algoritmo de layout y entra en las claves de cache. */
  type: 'architecture' | 'flow' | 'er';
  /** Nodos visibles en orden de documento. */
  nodes: NodoResuelto[];
  /** Aristas entre Nodos visibles, con las de los hijos de un Grupo colapsado elevadas a el. */
  edges: AristaResuelta[];
  /** Tal cual en la Vista; de aqui salen los Pins. */
  overrides: OverrideDeNodo[];
  /** Tal cual en la Vista; los interpreta `revealAt`. */
  steps: Paso[];
}

/** Sin Aristas ni Pins: el layout de secuencia es determinista y el orden de columnas lo da `order`. */
export interface VistaDeSecuencia {
  type: 'sequence';
  /** Lifelines en orden de columna, sin hijos. */
  nodes: NodoResuelto[];
  /** La Interaccion proyectada; vacia (sin Mensajes) si la Vista nombra una que no existe (`validate` lo informa). */
  interaction: InteraccionResuelta;
  steps: PasoResuelto[];
}

export type VistaResuelta = VistaDeGrafo | VistaDeSecuencia;

/** Estado de colapso del llamador (p. ej. la shell); gana a lo declarado en la Vista. */
export interface EstadoDeColapso {
  expanded?: readonly string[];
  collapsed?: readonly string[];
}

/**
 * `include` (`a` un Nodo, `a.*` hijos directos, `a.**` descendientes, `*` raices, `**` todo) menos `exclude`;
 * `undefined` si la Vista no existe. Un selector sin coincidencias no es error, y `exclude` no arrastra
 * descendientes. `color` es un nombre de Paleta; el valor literal lo pone el Tema.
 *
 * Un Grupo con `link` siempre esta colapsado; si no, decide por precedencia `estado`, luego `collapsed`/`expanded`
 * de la Vista y luego `depth` (nivel >= `depth` abre colapsado; las raices son nivel 1; `depth 0` no muestra nada).
 * Bajo un Grupo colapsado nada es visible: las Aristas de sus descendientes se elevan al Grupo y se fusionan por
 * par de extremos (se pierde el Atributo elevado; las internas al Grupo desaparecen).
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
  const overrides = new Map(vista.overrides.map((override) => [override.node, override]));
  const colorDeTipo = new Map(fuente.specification.nodeTypes.map((tipo) => [tipo.name, tipo.color]));
  const iconoDeTipo = new Map(fuente.specification.nodeTypes.map((tipo) => [tipo.name, tipo.icon]));
  const enlaces = new Map(vista.links.map(({ node, view }) => [node, view]));
  const resolver = (nodo: Nodo): NodoResuelto => {
    const { children, ...resto } = nodo;
    const enlace = enlaces.get(nodo.id);
    const override = overrides.get(nodo.id);
    const color = override?.color ?? colorDeTipo.get(nodo.type);
    const icon = iconoDeTipo.get(nodo.type);
    return {
      ...resto,
      label: override?.label ?? nodo.title,
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      children: children.filter((hijo) => visibles.has(hijo.id)).map(resolver),
      collapsed: colapsado(nodo),
      childCount: children.length,
      ...(enlace !== undefined && { link: enlace }),
    };
  };

  if (vista.type === 'sequence') {
    const { nodes, interaction } = resolverSecuencia(fuente.model.interactions, fuente.model.nodes, vista, excluidos, resolver, ancestroColapsado);
    return { type: vista.type, nodes, interaction, steps: pasosDeSecuencia(vista, interaction) };
  }

  return {
    type: vista.type,
    nodes: todos.filter((nodo) => visibles.has(nodo.id)).map(resolver),
    edges: elevarAristas(fuente.model.edges, visibles, ancestroColapsado),
    overrides: vista.overrides,
    steps: vista.steps,
  };
}

/**
 * Un Paso cuyo `upto` no existe o no se proyecta se omite (`validate` lo informa). `steps each` da un Paso por
 * Mensaje proyectado, titulado con su etiqueta sin el numero de `autonumber`, o `from -> to`.
 */
function pasosDeSecuencia(vista: Vista, interaccion: InteraccionResuelta): PasoResuelto[] {
  const mensajes = interaccion.messages;
  if (vista.stepsEach === true && vista.steps.length === 0) {
    return mensajes.map((mensaje) => {
      const etiqueta = mensaje.numero === undefined ? mensaje.label : mensaje.label?.slice(`${mensaje.numero}. `.length);
      return { title: etiqueta !== undefined && etiqueta !== '' ? etiqueta : `${mensaje.from} -> ${mensaje.to}`, show: [], hide: [], corte: mensaje.ruta };
    });
  }
  return vista.steps.flatMap((paso): PasoResuelto[] => {
    const mensaje = paso.upto === undefined ? undefined : mensajes.find((m) => m.id === paso.upto);
    return mensaje === undefined ? [] : [{ ...paso, corte: mensaje.ruta }];
  });
}

function estaColapsado(nodo: Nodo, vista: Vista, estado: EstadoDeColapso): boolean {
  if (nodo.children.length === 0) return false;
  if (vista.links.some((enlace) => enlace.node === nodo.id)) return true;
  if (estado.expanded?.includes(nodo.id)) return false;
  if (estado.collapsed?.includes(nodo.id)) return true;
  if (vista.expanded.includes(nodo.id)) return false;
  if (vista.collapsed.includes(nodo.id)) return true;
  return vista.depth !== undefined && nivel(nodo.id) >= vista.depth;
}

/** Las que quedan con ambos extremos en el mismo Grupo se descartan; las que repiten par se fusionan sumando `count`. */
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
      const { fromCardinality, toCardinality, label, identifying, ...sinCardinalidad } = previa;
      // Una linea fusionada es identificante solo si todas las Aristas que agrupa lo son.
      fusionadas.set(clave, { ...sinCardinalidad, ...(identifying === true && arista.identifying === true && { identifying }), count: previa.count + 1 });
    }
  }
  return [...fusionadas.values()];
}

function elevar(extremo: Extremo, ancestroColapsado: ReadonlyMap<string, string>): Extremo {
  const grupo = ancestroColapsado.get(extremo.node);
  return grupo === undefined ? extremo : { node: grupo };
}

/** En orden de documento. */
function aplanar(nodos: readonly Nodo[]): Nodo[] {
  return nodos.flatMap((nodo) => [nodo, ...aplanar(nodo.children)]);
}

function nivel(id: string): number {
  return id.split('.').length;
}

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
