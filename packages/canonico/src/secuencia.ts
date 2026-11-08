/**
 * Secuencia en `canonico`: resolucion de una Interaccion para una Vista `sequence` y la derivacion de
 * activaciones. Pura. Una Vista de secuencia proyecta exactamente una Interaccion: sus Lifelines son los
 * Nodos que participan, en el orden de `order` y luego por primera aparicion.
 */
import type { Interaccion, ItemDeInteraccion, Mensaje, Nodo, OperadorDeFragmento, TipoDeMensaje, Vista } from './esquema';
import type { NodoResuelto } from './vistas';

/** Mensaje proyectado por una Vista; `ruta` es su identidad (ruta de indices en la Interaccion, hoy un solo indice). */
export interface MensajeResuelto {
  ruta: string;
  /** Alias opcional del Mensaje, unico en su Interaccion. */
  id?: string;
  kind: TipoDeMensaje;
  from: string;
  to: string;
  label?: string;
  /** Rutas de los Fragmentos que lo contienen, de fuera hacia dentro; ausente si esta al nivel de la Interaccion. */
  ambito?: string[];
  /** Numero de `autonumber` (ya incluido en `label`); ausente si la Vista no numera. */
  numero?: number;
}

/** Grupo abierto cuyo `box` envuelve a las Lifelines de sus hijas; `lifelines` son las que contiene, en orden de columna (la del propio Grupo, si la tiene, primera). */
export interface CajaDeGrupo {
  id: string;
  label: string;
  /** Anidacion entre `box`es (0 el exterior). */
  nivel: number;
  lifelines: string[];
}

/** Fragmento proyectado: `ruta` es su identidad (indice del item, o `2.0.1` si esta dentro del operando 0 del item 2). */
export interface FragmentoResuelto {
  type: 'fragment';
  ruta: string;
  operator: OperadorDeFragmento;
  operands: { guard?: string; items: ItemResuelto[] }[];
}

/** Item proyectado de una Interaccion, en orden temporal. */
export type ItemResuelto = { type: 'message'; message: MensajeResuelto } | FragmentoResuelto;

/** Interaccion tal como la proyecta una Vista: sus Mensajes tras `exclude`, en orden temporal. */
export interface InteraccionResuelta {
  id: string;
  title: string;
  messages: MensajeResuelto[];
  /** Los mismos Mensajes con sus Fragmentos, en arbol. */
  items: ItemResuelto[];
  /** `box` de los Grupos abiertos con Lifelines hijas, los exteriores antes que los anidados. */
  groups?: CajaDeGrupo[];
}

/**
 * Activacion derivada: un `sync` abre una en el receptor y el siguiente `reply` del receptor al emisor la cierra
 * (pila para las anidadas). `desde` y `hasta` son indices en la lista de Mensajes; `hasta` es `null` si el `sync` no tiene
 * `reply` (dura hasta el fin de la Interaccion, o hasta el fin de su Fragmento: ver `cierraEn`). `nivel` es la profundidad de anidacion en su Lifeline (0 la exterior).
 */
export interface Activacion {
  lifeline: string;
  desde: number;
  hasta: number | null;
  nivel: number;
  /** Ruta del Fragmento al que cierra el fin de la activacion, cuando su `sync` quedo sin `reply` dentro de un Fragmento. */
  cierraEn?: string;
}

/**
 * Activaciones de una lista de Mensajes y los indices de los `reply` que no cierran ninguna (sin `sync` abierto del
 * emisor al receptor). `async` no abre activacion; un Mensaje propio `sync` abre una anidada en su Lifeline.
 */
export function activacionesDe(mensajes: readonly (Pick<Mensaje, 'kind' | 'from' | 'to'> & { ambito?: readonly string[] })[]): { activaciones: Activacion[]; respuestasSueltas: number[] } {
  const activaciones: Activacion[] = [];
  const abiertas: Activacion[] = [];
  const respuestasSueltas: number[] = [];
  const llamadores = new Map<Activacion, string>();
  const ambitos = new Map<Activacion, readonly string[]>();
  /** Un `sync` sin `reply` abierto dentro de un Fragmento termina cuando el flujo sale de ese Fragmento. */
  const cerrarLosQueSalen = (actual: readonly string[]): void => {
    for (let i = abiertas.length - 1; i >= 0; i--) {
      const ambito = ambitos.get(abiertas[i]!)!;
      const ultimo = ambito.at(-1);
      if (ultimo !== undefined && actual[ambito.length - 1] !== ultimo) {
        abiertas[i]!.cierraEn = ultimo;
        abiertas.splice(i, 1);
      }
    }
  };
  mensajes.forEach((mensaje, indice) => {
    cerrarLosQueSalen(mensaje.ambito ?? []);
    if (mensaje.kind === 'sync') {
      const nivel = abiertas.filter((a) => a.lifeline === mensaje.to).length;
      const activacion: Activacion = { lifeline: mensaje.to, desde: indice, hasta: null, nivel };
      llamadores.set(activacion, mensaje.from);
      ambitos.set(activacion, mensaje.ambito ?? []);
      abiertas.push(activacion);
      activaciones.push(activacion);
    } else if (mensaje.kind === 'reply') {
      const posicion = abiertas.map((a) => a.lifeline === mensaje.from && llamadores.get(a) === mensaje.to).lastIndexOf(true);
      if (posicion < 0) {
        respuestasSueltas.push(indice);
      } else {
        abiertas[posicion]!.hasta = indice;
        abiertas.splice(posicion, 1);
      }
    }
  });
  cerrarLosQueSalen([]);
  return { activaciones, respuestasSueltas };
}

/** Todos los Nodos del Modelo por id, a cualquier profundidad. */
function nodosPorId(nodos: readonly Nodo[], destino = new Map<string, Nodo>()): Map<string, Nodo> {
  for (const nodo of nodos) {
    destino.set(nodo.id, nodo);
    nodosPorId(nodo.children, destino);
  }
  return destino;
}

/** Ids de las Lifelines de una lista de Mensajes: `order` primero (los que participan), luego por primera aparicion. */
export function lifelinesDe(mensajes: readonly Pick<Mensaje, 'from' | 'to'>[], order: readonly string[]): string[] {
  const aparicion = [...new Set(mensajes.flatMap((m) => [m.from, m.to]))];
  const ordenadas = [...new Set(order)].filter((id) => aparicion.includes(id));
  return [...ordenadas, ...aparicion.filter((id) => !ordenadas.includes(id))];
}

/**
 * Proyecta la Interaccion de `vista`: las Lifelines (Nodos resueltos, sin hijos, en orden de columna) y los Mensajes.
 * Un extremo dentro de un Grupo colapsado (`ancestroColapsado`) se eleva al Grupo; el Mensaje que queda con ambos
 * extremos en la misma Lifeline pasa a ser propio. `create`/`destroy` de un descendiente no crean ni destruyen el Grupo:
 * al elevarse pasan a `async`. Un extremo excluido (o su Grupo) quita el Mensaje; un Fragmento sin Mensajes desaparece.
 * Con `autonumber` cada Mensaje proyectado lleva su numero delante de la etiqueta. Una Interaccion o un Nodo que no
 * existen se omiten (`validate` los informa).
 */
export function resolverSecuencia(
  interacciones: readonly Interaccion[],
  nodos: readonly Nodo[],
  vista: Vista,
  excluidos: ReadonlySet<string>,
  resolverNodo: (nodo: Nodo) => NodoResuelto,
  ancestroColapsado: ReadonlyMap<string, string> = new Map(),
): { nodes: NodoResuelto[]; interaction?: InteraccionResuelta } {
  const interaccion = interacciones.find((candidata) => candidata.id === vista.interaction);
  if (interaccion === undefined) return { nodes: [] };
  const porId = nodosPorId(nodos);
  const elevar = (id: string): string => ancestroColapsado.get(id) ?? id;
  const visible = (id: string): boolean => porId.has(id) && !excluidos.has(id) && !excluidos.has(elevar(id));
  const mensajes: MensajeResuelto[] = [];
  const proyectar = (items: readonly ItemDeInteraccion[], prefijo: string, ambito: string[]): ItemResuelto[] =>
    items.flatMap((item, indice): ItemResuelto[] => {
      const ruta = `${prefijo}${indice}`;
      if (item.type === 'fragment') {
        const dentro = [...ambito, ruta];
        const operandos = item.operands.map((operando, k) => ({ ...(operando.guard !== undefined && { guard: operando.guard }), items: proyectar(operando.items, `${ruta}.${k}.`, dentro) }));
        return operandos.every((operando) => operando.items.length === 0) ? [] : [{ type: 'fragment', ruta, operator: item.operator, operands: operandos }];
      }
      if (!visible(item.from) || !visible(item.to)) return [];
      const from = elevar(item.from);
      const to = elevar(item.to);
      const kind = (item.kind === 'create' || item.kind === 'destroy') && to !== item.to ? 'async' : item.kind;
      const mensaje: MensajeResuelto = { ruta, ...(item.id !== undefined && { id: item.id }), kind, from, to, ...(item.label !== undefined && { label: item.label }), ...(ambito.length > 0 && { ambito }) };
      mensajes.push(mensaje);
      return [{ type: 'message', message: mensaje }];
    });
  const items = proyectar(interaccion.items, '', []);
  if (vista.autonumber === true) {
    mensajes.forEach((mensaje, i) => {
      mensaje.numero = i + 1;
      mensaje.label = mensaje.label === undefined ? `${i + 1}` : `${i + 1}. ${mensaje.label}`;
    });
  }
  const ordenadas = lifelinesDe(mensajes, vista.order.map(elevar));
  const { orden, grupos } = agruparLifelines(ordenadas, nodos);
  const lifelines = orden.map((id) => ({ ...resolverNodo(porId.get(id)!), children: [] }));
  const groups = grupos.map((grupo) => ({ ...grupo, label: resolverNodo(porId.get(grupo.id)!).label }));
  return { nodes: lifelines, interaction: { id: interaccion.id, title: interaccion.title, messages: mensajes, items, ...(groups.length > 0 && { groups }) } };
}

/**
 * Los `box` de los Grupos abiertos: un Grupo tiene `box` si alguna Lifeline es descendiente suyo. Reordena las
 * Lifelines para que las de cada `box` sean contiguas (en el sitio de la primera aparicion) con la del propio
 * Grupo, si la tiene, primera. Devuelve el nuevo orden y los `box` de fuera hacia dentro.
 */
function agruparLifelines(ids: readonly string[], raices: readonly Nodo[]): { orden: string[]; grupos: Omit<CajaDeGrupo, 'label'>[] } {
  const padre = new Map<string, string>();
  const registrar = (hijos: readonly Nodo[], de: string | undefined): void => {
    for (const hijo of hijos) {
      if (de !== undefined) padre.set(hijo.id, de);
      registrar(hijo.children, hijo.id);
    }
  };
  registrar(raices, undefined);
  const ancestros = (id: string): string[] => {
    const cadena: string[] = [];
    for (let actual = padre.get(id); actual !== undefined; actual = padre.get(actual)) cadena.unshift(actual);
    return cadena;
  };
  const conCaja = new Set(ids.flatMap(ancestros));
  const cadena = (id: string): string[] => [...ancestros(id), ...(conCaja.has(id) ? [id] : [])];
  const agrupar = (miembros: readonly string[], nivel: number): string[] => {
    const resultado: string[] = [];
    const vistos = new Set<string>();
    for (const id of miembros) {
      const clave = cadena(id)[nivel];
      if (clave === undefined) {
        resultado.push(id);
      } else if (!vistos.has(clave)) {
        vistos.add(clave);
        const dentro = miembros.filter((m) => cadena(m)[nivel] === clave);
        resultado.push(...agrupar([...dentro.filter((m) => m === clave), ...dentro.filter((m) => m !== clave)], nivel + 1));
      }
    }
    return resultado;
  };
  const orden = agrupar(ids, 0);
  const grupos = [...conCaja]
    .map((id) => ({ id, nivel: ancestros(id).length, lifelines: orden.filter((l) => cadena(l).includes(id)) }))
    .sort((a, b) => a.nivel - b.nivel || orden.indexOf(a.lifelines[0]!) - orden.indexOf(b.lifelines[0]!));
  return { orden, grupos };
}

/** Mensaje del Modelo con su ruta en la Interaccion (`['items', 2, 'operands', 0, 'items', 1]`) y los Fragmentos que lo contienen. */
export interface MensajeUbicado extends Mensaje {
  ubicacion: (string | number)[];
  ambito: string[];
}

/** Mensajes de una lista de items, en orden temporal, aplanando los Fragmentos. */
export function aplanarMensajes(items: readonly ItemDeInteraccion[], ubicacion: (string | number)[] = ['items'], prefijo = '', ambito: string[] = []): MensajeUbicado[] {
  return items.flatMap((item, indice): MensajeUbicado[] => {
    const aqui = [...ubicacion, indice];
    if (item.type === 'message') return [{ ...item, ubicacion: aqui, ambito }];
    const ruta = `${prefijo}${indice}`;
    return item.operands.flatMap((operando, k) => aplanarMensajes(operando.items, [...aqui, 'operands', k, 'items'], `${ruta}.${k}.`, [...ambito, ruta]));
  });
}
