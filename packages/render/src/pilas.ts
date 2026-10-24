/**
 * Pilas de Capas por elemento (ADR 0008): el Nodo, el Grupo abierto y el Grupo colapsado
 * (una hoja) tienen cada uno su pintura, y cada uno puede variar por Tipo de nodo. Es
 * la unica ruta por la que la hoja de estilo, la animacion y la escena eligen que pila
 * se dibuja, asi que Nodos y Grupos se tratan con el mismo codigo y sus selectores
 * quedan separados (`.rd-nodo`, `.rd-grupo`, `.rd-colapsado`). Un Tipo con parches
 * trae su pila completa y la elige el atributo `data-tipo` del elemento; un Tipo sin
 * parches usa la del elemento.
 */
import type { NodoResuelto } from 'canonico';
import type { Pintura, PinturaDeElemento, PinturaDeNodo } from 'tema';

export type ClaveDeElemento = 'nodo' | 'grupo' | 'colapsado';

/** Claves en el orden en que la hoja las emite. */
export const ELEMENTOS: readonly ClaveDeElemento[] = ['nodo', 'grupo', 'colapsado'];

export function pinturaDeElemento(pintura: Pintura, clave: ClaveDeElemento): PinturaDeElemento {
  return clave === 'nodo' ? pintura.nodo : clave === 'grupo' ? pintura.grupo.abierto : pintura.grupo.colapsado;
}

/** Elemento con que se dibuja un Nodo visible: un Grupo cerrado es una hoja con su propia pintura. */
export function claveDe(nodo: Pick<NodoResuelto, 'collapsed' | 'children'>): ClaveDeElemento {
  return nodo.collapsed ? 'colapsado' : nodo.children.length > 0 ? 'grupo' : 'nodo';
}

/** Selector del atributo `data-tipo` de un Tipo. Los nombres son identificadores del DSL; el resto de caracteres no puede aparecer. */
const deTipo = (tipo: string): string => `[data-tipo="${tipo.replace(/[^\w-]/g, '')}"]`;

/** Una pila vigente: la del elemento sin Tipo o la de un Tipo con parches, con los selectores que la alcanzan. */
export interface PilaVigente {
  clave: ClaveDeElemento;
  tipo?: string;
  /** Selector (con `&` por la clase de alcance) del elemento que la lleva. */
  selector: string;
  /** Selector de la caja `.rd-caja` que contiene a ese elemento y al contorno de sus estados. */
  caja: string;
  pila: PinturaDeNodo;
}

/** Las pilas de un elemento: la base (la que no lleva `data-tipo` si hay Tipos con pila propia) y una por Tipo con parches. */
export function pilasDeElemento(pintura: Pintura, clave: ClaveDeElemento): PilaVigente[] {
  const elemento = pinturaDeElemento(pintura, clave);
  const tipos = Object.keys(elemento.tipos);
  const vigente = (filtro: string, pila: PinturaDeNodo, tipo?: string): PilaVigente => ({
    clave,
    ...(tipo !== undefined && { tipo }),
    selector: `& .rd-${clave}${filtro}`,
    caja: `& .rd-caja[data-elemento="${clave}"]${filtro}`,
    pila,
  });
  return [vigente(tipos.length === 0 ? '' : ':not([data-tipo])', elemento), ...tipos.map((tipo) => vigente(deTipo(tipo), elemento.tipos[tipo]!, tipo))];
}

/** Pila con la que se dibuja un Nodo: la de su Tipo si el Tema la parchea, si no la del elemento; `tipo` es lo que lleva su `data-tipo`. */
export function pilaDeNodo(pintura: Pintura, nodo: Pick<NodoResuelto, 'collapsed' | 'children' | 'type'>): { clave: ClaveDeElemento; tipo?: string; pila: PinturaDeNodo } {
  const clave = claveDe(nodo);
  const elemento = pinturaDeElemento(pintura, clave);
  const propia = Object.hasOwn(elemento.tipos, nodo.type);
  return { clave, ...(propia && { tipo: nodo.type }), pila: propia ? elemento.tipos[nodo.type]! : elemento };
}
