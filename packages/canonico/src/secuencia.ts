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
 * Proyecta la Interaccion de `vista`: las Lifelines (Nodos resueltos, sin hijos, en orden de columna) y los Mensajes
 * sin los de una Lifeline excluida. Una Interaccion o un Nodo que no existen se omiten (`validate` los informa).
 */
export function resolverSecuencia(
  interacciones: readonly Interaccion[],
  nodos: readonly Nodo[],
  vista: Vista,
  excluidos: ReadonlySet<string>,
  resolverNodo: (nodo: Nodo) => NodoResuelto,
): { nodes: NodoResuelto[]; interaction?: InteraccionResuelta } {
  const interaccion = interacciones.find((candidata) => candidata.id === vista.interaction);
  if (interaccion === undefined) return { nodes: [] };
  const porId = nodosPorId(nodos);
  const visible = (id: string): boolean => porId.has(id) && !excluidos.has(id);
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
      const mensaje: MensajeResuelto = { ruta, ...(item.id !== undefined && { id: item.id }), kind: item.kind, from: item.from, to: item.to, ...(item.label !== undefined && { label: item.label }), ...(ambito.length > 0 && { ambito }) };
      mensajes.push(mensaje);
      return [{ type: 'message', message: mensaje }];
    });
  const items = proyectar(interaccion.items, '', []);
  const lifelines = lifelinesDe(mensajes, vista.order).map((id) => ({ ...resolverNodo(porId.get(id)!), children: [] }));
  return { nodes: lifelines, interaction: { id: interaccion.id, title: interaccion.title, messages: mensajes, items } };
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
