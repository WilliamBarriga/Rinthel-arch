/**
 * Pasos de revelado (ADR 0002). Puro y sin geometria: el layout se calcula una vez con todos los elementos.
 * Un Paso no anima; el Tema dispara `enter`/`exit` (ADR 0008).
 */
import type { AristaDePaso, Arista, ElementoDePaso } from './esquema';
import { matchesSelector } from './vistas';
import type { NodoResuelto, VistaDeGrafo, VistaDeSecuencia, VistaResuelta } from './vistas';
import type { ItemResuelto } from './secuencia';

/**
 * Visibilidad por id de Nodo, `idDeArista` o `idDeElementoDeSecuencia`: 0 oculto, 1 revelado. `revealAt` solo
 * produce 0 y 1; es numerico para que quien anima (el morph de la shell) funda con valores intermedios.
 */
export type Visibilidad = (id: string) => number;

/**
 * Id de un Mensaje, Nota, `ref` o Fragmento: `<interaccion>:<ruta>`; con `operando`, el de su guarda y su divisor:
 * `<interaccion>:<ruta>:<k>`. Unico sitio que arma el formato.
 */
export function idDeElementoDeSecuencia(interaccion: string, ruta: string, operando?: number): string {
  return operando === undefined ? `${interaccion}:${ruta}` : `${interaccion}:${ruta}:${operando}`;
}

/** Lectura inversa de `idDeElementoDeSecuencia`; `undefined` si `id` no tiene ese formato (p. ej. el id de un Nodo). */
export function leerIdDeElementoDeSecuencia(id: string): { interaccion: string; ruta: string; operando?: number } | undefined {
  const m = /^(.+?):(\d+(?:\.\d+)*)(?::(\d+))?$/.exec(id);
  if (m === null) return undefined;
  return { interaccion: m[1]!, ruta: m[2]!, ...(m[3] !== undefined && { operando: Number(m[3]) }) };
}

/** `desde -> hasta`, con `#atributo` si el extremo lo lleva. */
export function idDeArista(arista: Pick<Arista, 'from' | 'to'>): string {
  const extremo = ({ node, attribute }: Arista['from']): string => (attribute === undefined ? node : `${node}#${attribute}`);
  return `${extremo(arista.from)} -> ${extremo(arista.to)}`;
}

/**
 * El entero k aplica los pasos 1..k (0 es antes del primero); una fraccion cuenta como su parte entera y fuera
 * de rango se acota. Sin `steps` todo vale 1. Una Arista aparece sola con ambos extremos visibles, salvo que algun
 * paso la nombre: entonces espera a ese paso. Un Grupo colapsado vale 1 si el o alguno de sus hijos esta revelado.
 * `a.*` y `a.**` revelan (o con `hide`, ocultan) tambien al Grupo `a`.
 */
export function revealAt(vista: VistaResuelta, position: number): Visibilidad {
  const { steps } = vista;
  if (steps.length === 0) return () => 1;

  const acotada = Number.isNaN(position) ? 0 : Math.min(Math.max(position, 0), steps.length);
  switch (vista.type) {
    case 'sequence':
      return revelarSecuencia(vista, Math.floor(acotada));
    case 'architecture':
    case 'flow':
    case 'er': {
      const reveladosTras = estadoTras(vista, Math.floor(acotada));
      return (id) => (reveladosTras.has(id) ? 1 : 0);
    }
  }
}

function estadoTras(vista: VistaDeGrafo, k: number): Set<string> {
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

/** A diferencia de `include` de la Vista, `a.*` y `a.**` abarcan tambien al Grupo `a`. */
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

/** Ignora los Atributos de los extremos; un extremo dentro de un Grupo colapsado casa con el Grupo, donde se elevo. */
function idsDeAristas(vista: VistaDeGrafo, item: AristaDePaso): string[] {
  return vista.edges
    .filter((arista) => esExtremo(arista.from.node, item.from) && esExtremo(arista.to.node, item.to))
    .map(idDeArista);
}

function esExtremo(enVista: string, nombrado: string): boolean {
  return enVista === nombrado || nombrado.startsWith(`${enVista}.`);
}

/**
 * El Paso k corta el tiempo en el Mensaje `corte` de su Paso. En el Paso 0 nada esta revelado; desde el primero, todas
 * las Lifelines salvo las nacidas con `create`, que aparecen con su Mensaje. Una Nota o `ref` aparece con el Mensaje
 * que la precede (las previas al primero, en el primer Paso); un Fragmento y cada operando, al entrar el corte en su
 * primer Mensaje.
 */
function revelarSecuencia(vista: VistaDeSecuencia, k: number): Visibilidad {
  const interaccion = vista.interaction;
  const paso = vista.steps[k - 1];
  if (paso === undefined) return () => 0;
  const mensajes = interaccion.messages;
  const corte = mensajes.findIndex((mensaje) => mensaje.ruta === paso.corte);
  const revelados = new Set<string>();
  const idDe = (ruta: string, operando?: number): string => idDeElementoDeSecuencia(interaccion.id, ruta, operando);

  const creada = new Map(mensajes.flatMap((mensaje, i) => (mensaje.kind === 'create' ? [[mensaje.to, i] as const] : [])));
  for (const nodo of vista.nodes) {
    if ((creada.get(nodo.id) ?? -1) <= corte) revelados.add(nodo.id);
  }
  mensajes.forEach((mensaje, i) => {
    if (i <= corte) revelados.add(idDe(mensaje.ruta));
  });

  // `previo`: indice del ultimo Mensaje visto en orden temporal (-1 si ninguno).
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
        if (previo <= corte) revelados.add(idDe(item.ruta));
      } else {
        const entra = primerMensaje([item], previo);
        if (entra <= corte) revelados.add(idDe(item.ruta));
        item.operands.forEach((operando, o) => {
          if (primerMensaje(operando.items, previo) <= corte) revelados.add(idDe(item.ruta, o));
          previo = recorrer(operando.items, previo);
        });
      }
    }
    return previo;
  };
  recorrer(interaccion.items, -1);
  return (id) => (revelados.has(id) ? 1 : 0);
}
