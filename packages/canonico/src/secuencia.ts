/**
 * Secuencia en `canonico`: resolucion de una Interaccion para una Vista `sequence` y la derivacion de
 * activaciones. Pura. Una Vista de secuencia proyecta exactamente una Interaccion: sus Lifelines son los
 * Nodos que participan, en el orden de `order` y luego por primera aparicion.
 */
import type { Interaccion, Mensaje, Nodo, TipoDeMensaje, Vista } from './esquema';
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
}

/** Interaccion tal como la proyecta una Vista: sus Mensajes tras `exclude`, en orden temporal. */
export interface InteraccionResuelta {
  id: string;
  title: string;
  messages: MensajeResuelto[];
}

/**
 * Activacion derivada: un `sync` abre una en el receptor y el siguiente `reply` del receptor al emisor la cierra
 * (pila para las anidadas). `desde` y `hasta` son indices en la lista de Mensajes; `hasta` es `null` si el `sync` no tiene
 * `reply` (dura hasta el fin de la Interaccion). `nivel` es la profundidad de anidacion en su Lifeline (0 la exterior).
 */
export interface Activacion {
  lifeline: string;
  desde: number;
  hasta: number | null;
  nivel: number;
}

/**
 * Activaciones de una lista de Mensajes y los indices de los `reply` que no cierran ninguna (sin `sync` abierto del
 * emisor al receptor). `async` no abre activacion; un Mensaje propio `sync` abre una anidada en su Lifeline.
 */
export function activacionesDe(mensajes: readonly Pick<Mensaje, 'kind' | 'from' | 'to'>[]): { activaciones: Activacion[]; respuestasSueltas: number[] } {
  const activaciones: Activacion[] = [];
  const abiertas: Activacion[] = [];
  const respuestasSueltas: number[] = [];
  const llamadores = new Map<Activacion, string>();
  mensajes.forEach((mensaje, indice) => {
    if (mensaje.kind === 'sync') {
      const nivel = abiertas.filter((a) => a.lifeline === mensaje.to).length;
      const activacion: Activacion = { lifeline: mensaje.to, desde: indice, hasta: null, nivel };
      llamadores.set(activacion, mensaje.from);
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
  const mensajes: MensajeResuelto[] = interaccion.items.flatMap((item, indice) =>
    porId.has(item.from) && porId.has(item.to) && !excluidos.has(item.from) && !excluidos.has(item.to)
      ? [{ ruta: String(indice), ...(item.id !== undefined && { id: item.id }), kind: item.kind, from: item.from, to: item.to, ...(item.label !== undefined && { label: item.label }) }]
      : [],
  );
  const lifelines = lifelinesDe(mensajes, vista.order).map((id) => ({ ...resolverNodo(porId.get(id)!), children: [] }));
  return { nodes: lifelines, interaction: { id: interaccion.id, title: interaccion.title, messages: mensajes } };
}
