/**
 * Pasos de revelado (ADR 0002): `revealAt` convierte una posicion de paso en la
 * visibilidad (0 o 1) de cada Nodo y Arista de una Vista resuelta. Pura; no toca
 * la geometria: el layout se calcula una vez con todos los elementos. Un Paso no
 * anima: solo cambia que esta revelado y el Tema dispara `enter`/`exit` (ADR 0008).
 */
import type { AristaDePaso, Arista, ElementoDePaso } from './esquema';
import { matchesSelector } from './vistas';
import type { NodoResuelto, VistaResuelta } from './vistas';
import type { ItemResuelto } from './secuencia';

/**
 * Visibilidad de un Nodo (por id) o una Arista (por `idDeArista`): 0 oculto, 1 revelado.
 * `revealAt` solo produce 0 y 1; el tipo sigue siendo numerico para que quien anima el
 * layout por su cuenta (el morph de la shell) pueda fundir con valores intermedios.
 */
export type Visibilidad = (id: string) => number;

/** Id de una Arista para `Visibilidad`: `desde -> hasta`, con `#atributo` si el extremo lo lleva. */
export function idDeArista(arista: Pick<Arista, 'from' | 'to'>): string {
  const extremo = ({ node, attribute }: Arista['from']): string => (attribute === undefined ? node : `${node}#${attribute}`);
  return `${extremo(arista.from)} -> ${extremo(arista.to)}`;
}

/**
 * Visibilidad en la posicion `position`: el entero k aplica los pasos 1..k (0 es
 * antes del primero); una fraccion cuenta como su parte entera (no hay revelado
 * continuo, ADR 0002) y fuera de rango se acota. Sin `steps` todo vale 1. Una Arista
 * aparece sola con ambos extremos visibles, salvo que algun paso la nombre: entonces
 * espera a ese paso. Un Grupo colapsado vale 1 si el mismo o alguno de sus hijos esta
 * revelado. Los selectores `a.*` y `a.**` revelan (o con `hide`, ocultan) tambien al
 * Grupo `a`.
 */
export function revealAt(vista: VistaResuelta, position: number): Visibilidad {
  const { steps } = vista;
  if (steps.length === 0) return () => 1;

  const acotada = Number.isNaN(position) ? 0 : Math.min(Math.max(position, 0), steps.length);
  if (vista.type === 'sequence') return revelarSecuencia(vista, Math.floor(acotada));
  const reveladosTras = estadoTras(vista, Math.floor(acotada));
  return (id) => (reveladosTras.has(id) ? 1 : 0);
}

/** Ids (Nodos y Aristas) revelados tras aplicar los primeros `k` pasos. */
function estadoTras(vista: VistaResuelta, k: number): Set<string> {
  const nodos = vista.nodes;
  const nombradas = new Set(
    vista.steps.flatMap((paso) => paso.show.filter(esArista).flatMap((item) => idsDeAristas(vista, item))),
  );
  const revelados = new Set<string>();
  const mostradas = new Set<string>();
  const ocultas = new Set<string>();

  for (const paso of vista.steps.slice(0, k)) {
    for (const item of paso.show) {
      if (esArista(item)) {
        for (const id of idsDeAristas(vista, item)) {
          mostradas.add(id);
          ocultas.delete(id);
        }
      } else {
        for (const nodo of nodos) {
          if (alcanza(item.selector, nodo)) revelados.add(nodo.id);
        }
      }
    }
    for (const item of paso.hide) {
      if (esArista(item)) {
        for (const id of idsDeAristas(vista, item)) {
          mostradas.delete(id);
          ocultas.add(id);
        }
      } else {
        for (const nodo of nodos) {
          if (abarca(item.selector, nodo.id)) revelados.delete(nodo.id);
        }
      }
    }
  }

  const visibles = new Set(revelados);
  for (const arista of vista.edges) {
    const id = idDeArista(arista);
    const permitida = nombradas.has(id) ? mostradas.has(id) : !ocultas.has(id);
    if (permitida && revelados.has(arista.from.node) && revelados.has(arista.to.node)) visibles.add(id);
  }
  return visibles;
}

/**
 * Lo que un selector de Paso abarca. A diferencia de `include` de la Vista, `a.*` y
 * `a.**` incluyen al propio Grupo `a` ademas de sus hijos: es "revelar un Grupo
 * completo" (ADR 0002); `a` a secas sigue siendo solo `a`.
 */
function abarca(selector: string, id: string): boolean {
  if (matchesSelector(selector, id)) return true;
  return selector.endsWith('.*') || selector.endsWith('.**') ? id === selector.replace(/\.\*\*?$/, '') : false;
}

/** Un Grupo colapsado se revela tambien por cualquiera de sus hijos ocultos tras el. */
function alcanza(selector: string, nodo: NodoResuelto): boolean {
  if (abarca(selector, nodo.id)) return true;
  if (!nodo.collapsed) return false;
  const base = selector.replace(/\.\*\*?$/, '');
  return base === nodo.id || base.startsWith(`${nodo.id}.`);
}

function esArista(item: ElementoDePaso): item is AristaDePaso {
  return 'from' in item;
}

/**
 * Aristas de la Vista que une `item` (cualquier Atributo en los extremos). Un
 * extremo dentro de un Grupo colapsado corresponde al Grupo, donde se elevo.
 */
function idsDeAristas(vista: VistaResuelta, item: AristaDePaso): string[] {
  return vista.edges
    .filter((arista) => esExtremo(arista.from.node, item.from) && esExtremo(arista.to.node, item.to))
    .map(idDeArista);
}

function esExtremo(enVista: string, nombrado: string): boolean {
  return enVista === nombrado || nombrado.startsWith(`${enVista}.`);
}

/**
 * Revelado de una Vista de secuencia (ADR 0009): el Paso k es un corte del tiempo en el Mensaje `corte` de su Paso.
 * Ids: Lifeline (id del Nodo), Mensaje, Nota, `ref` y Fragmento (`<interaccion>:<ruta>`) y operando de un Fragmento
 * (`<interaccion>:<ruta>:<k>`: su guarda y su divisor). En el Paso 0 nada esta revelado; desde el primero, todas las
 * Lifelines salvo las nacidas con `create`, que aparecen con su Mensaje. Una Nota o `ref` aparece con el Mensaje que lo
 * precede (los previos al primero, en el primer Paso); un Fragmento, al entrar el corte en su primer Mensaje, y cada
 * operando, al entrar en el suyo.
 */
function revelarSecuencia(vista: VistaResuelta, k: number): Visibilidad {
  const interaccion = vista.interaction;
  const paso = vista.steps[k - 1];
  if (interaccion === undefined || paso === undefined) return () => 0;
  const mensajes = interaccion.messages;
  const corte = mensajes.findIndex((mensaje) => mensaje.ruta === paso.corte);
  const revelados = new Set<string>();
  const prefijo = `${interaccion.id}:`;

  const creada = new Map(mensajes.flatMap((mensaje, i) => (mensaje.kind === 'create' ? [[mensaje.to, i] as const] : [])));
  for (const nodo of vista.nodes) {
    if ((creada.get(nodo.id) ?? -1) <= corte) revelados.add(nodo.id);
  }
  mensajes.forEach((mensaje, i) => {
    if (i <= corte) revelados.add(`${prefijo}${mensaje.ruta}`);
  });

  // Recorrido en orden temporal: `previo` es el indice del ultimo Mensaje visto (-1 si ninguno).
  const primerMensaje = (items: readonly ItemResuelto[], desde: number): number => {
    for (const item of items) {
      if (item.type === 'message') return mensajes.indexOf(item.message);
      if (item.type === 'fragment') {
        for (const operando of item.operands) {
          const dentro = primerMensaje(operando.items, -2);
          if (dentro !== -2) return dentro;
        }
      }
    }
    return desde;
  };
  const recorrer = (items: readonly ItemResuelto[], previo: number): number => {
    for (const item of items) {
      if (item.type === 'message') {
        previo = mensajes.indexOf(item.message);
      } else if (item.type === 'note' || item.type === 'ref') {
        if (previo <= corte) revelados.add(`${prefijo}${item.ruta}`);
      } else {
        const entra = primerMensaje([item], previo);
        if (entra <= corte) revelados.add(`${prefijo}${item.ruta}`);
        item.operands.forEach((operando, o) => {
          if (primerMensaje(operando.items, previo) <= corte) revelados.add(`${prefijo}${item.ruta}:${o}`);
          previo = recorrer(operando.items, previo);
        });
      }
    }
    return previo;
  };
  recorrer(interaccion.items, -1);
  return (id) => (revelados.has(id) ? 1 : 0);
}
