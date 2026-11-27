/**
 * Pilas de Capas por elemento (Nodo, Grupo abierto, Grupo colapsado), con selectores `.rd-<clave>`. Un Tipo de nodo con
 * parches trae su pila completa y la elige `data-tipo`; un Tipo sin parches usa la del elemento.
 */
import type { ResolvedNode } from 'canonical';
import type { Paint, ElementPaint, NodePaint } from 'theme';

/** Pintura de Nodos y Grupos: la del Tema o la de la activacion derivada. */
type PinturasDeCaja = Pick<Paint, 'nodo' | 'grupo'>;

const PINTURA_DE = {
  nodo: (pintura: PinturasDeCaja): ElementPaint => pintura.nodo,
  grupo: (pintura: PinturasDeCaja): ElementPaint => pintura.grupo.abierto,
  colapsado: (pintura: PinturasDeCaja): ElementPaint => pintura.grupo.colapsado,
} as const;

export type ClaveDeElemento = keyof typeof PINTURA_DE;

/** Claves en el orden en que la hoja las emite. */
export const ELEMENTOS = Object.keys(PINTURA_DE) as readonly ClaveDeElemento[];

export const pinturaDeElemento = (pintura: PinturasDeCaja, clave: ClaveDeElemento): ElementPaint => PINTURA_DE[clave](pintura);

/** Elemento con que se dibuja un Nodo visible: un Grupo cerrado es una hoja con su propia pintura. */
export function claveDe(nodo: Pick<ResolvedNode, 'collapsed' | 'children'>): ClaveDeElemento {
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
  pila: NodePaint;
}

/** Las pilas de un elemento: la base (la que no lleva `data-tipo` si hay Tipos con pila propia) y una por Tipo con parches. */
export function pilasDeElemento(pintura: Paint, clave: ClaveDeElemento): PilaVigente[] {
  const elemento = pinturaDeElemento(pintura, clave);
  const tipos = Object.keys(elemento.tipos);
  const vigente = (filtro: string, pila: NodePaint, tipo?: string): PilaVigente => ({
    clave,
    ...(tipo !== undefined && { tipo }),
    selector: `& .rd-${clave}${filtro}`,
    caja: `& .rd-caja[data-elemento="${clave}"]${filtro}`,
    pila,
  });
  return [vigente(tipos.length === 0 ? '' : ':not([data-tipo])', elemento), ...tipos.map((tipo) => vigente(deTipo(tipo), elemento.tipos[tipo]!, tipo))];
}

/** Pila con la que se dibuja un Nodo: la de su Tipo si el Tema la parchea, si no la del elemento; `tipo` es lo que lleva su `data-tipo`. */
export function pilaDeNodo(pintura: PinturasDeCaja, nodo: Pick<ResolvedNode, 'collapsed' | 'children' | 'type'>): { clave: ClaveDeElemento; tipo?: string; pila: NodePaint } {
  const clave = claveDe(nodo);
  const elemento = pinturaDeElemento(pintura, clave);
  const propia = Object.hasOwn(elemento.tipos, nodo.type);
  return { clave, ...(propia && { tipo: nodo.type }), pila: propia ? elemento.tipos[nodo.type]! : elemento };
}
