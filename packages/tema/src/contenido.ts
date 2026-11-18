/** Modulo hoja: lo usan `metricas` y `slots` sin depender uno del otro. */

import type { Atributo, ClaveDeAtributo, NodoResuelto } from 'canonico';

import type { NombreDeSlot } from './catalogo';
import { slotsDe } from './disposicion';
import type { CajaDeSlots } from './disposicion';
import type { Metricas } from './metricas';

export interface ContenidoDeNodo {
  titulo: string;
  atributos: readonly Atributo[];
  icono: boolean;
  /** Slot `badge`. */
  tipo?: string;
  /** Slot `desc`; vacia, el Slot no reserva espacio. */
  descripcion?: string;
  /** Primera fuente del Nodo (Slot `footer`). */
  fuente?: string;
  /** Hijos que esconde un Grupo colapsado (Slot `counter`); solo existe en el colapsado. */
  cuenta?: number;
}

/** Solo los de un Nodo hoja (un Grupo colapsado es hoja) y solo si el Tema lista el Slot `attrs`. */
export function atributosVisibles(
  nodo: Pick<NodoResuelto, 'children' | 'attributes'>,
  metricas: Pick<Metricas, 'disposicion'>,
): readonly Atributo[] {
  return nodo.children.length === 0 && muestra(metricas, 'attrs') ? nodo.attributes : [];
}

const listas = new WeakMap<CajaDeSlots, readonly NombreDeSlot[]>();

/** Memoizado por disposicion. */
export function muestra(metricas: Pick<Metricas, 'disposicion'>, slot: NombreDeSlot): boolean {
  let lista = listas.get(metricas.disposicion);
  if (lista === undefined) listas.set(metricas.disposicion, (lista = slotsDe(metricas.disposicion)));
  return lista.includes(slot);
}

export function contenidoDeNodo(
  nodo: Pick<NodoResuelto, 'children' | 'attributes' | 'label' | 'icon' | 'type' | 'description' | 'source' | 'collapsed' | 'childCount'>,
  metricas: Pick<Metricas, 'disposicion' | 'iconoEsPunto'>,
): ContenidoDeNodo {
  const cuenta = nodo.collapsed ? nodo.childCount : undefined;
  return {
    // Sin Slot `counter`, un Grupo colapsado dice cuantos hijos esconde en el titulo.
    titulo: cuenta !== undefined && !muestra(metricas, 'counter') ? `${nodo.label} (${cuenta})` : nodo.label,
    atributos: atributosVisibles(nodo, metricas),
    icono: nodo.icon !== undefined || metricas.iconoEsPunto,
    tipo: nodo.type,
    descripcion: nodo.description,
    ...(nodo.source[0] !== undefined && { fuente: nodo.source[0].ref }),
    ...(cuenta !== undefined && { cuenta }),
  };
}

/** Con `marcas` (Vista ER) el tipo lleva `?` si el Atributo es opcional. */
export function textoDeAtributo(atributo: Atributo, marcas = false): string {
  return `${atributo.name}: ${atributo.type}${marcas && atributo.optional === true ? '?' : ''}`;
}

/** `tamano` en px. */
export interface PiezaDeAtributo {
  texto: string;
  tamano: number;
}

/** Con `metricas.tamanoDeFila` el nombre y el tipo son piezas de distinto tamano; sin el, una sola pieza al tamano de `attrs`. */
export function piezasDeAtributo(atributo: Atributo, metricas: Pick<Metricas, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): PiezaDeAtributo[] {
  const marcas = metricas.marcasDeClave === true;
  const base = metricas.fontSize * metricas.escalaAtributo;
  const { name, type } = metricas.tamanoDeFila ?? {};
  if (!marcas || (name === undefined && type === undefined)) return [{ texto: textoDeAtributo(atributo, marcas), tamano: base }];
  return [
    { texto: atributo.name, tamano: name ?? base },
    { texto: ': ', tamano: base },
    { texto: `${atributo.type}${atributo.optional === true ? '?' : ''}`, tamano: type ?? base },
  ];
}

/** `derecha` es su distancia al borde derecho de la fila. */
export interface ChipDeClave {
  clave: ClaveDeAtributo;
  texto: string;
  derecha: number;
  width: number;
  tamano: number;
}

const SEPARACION_DE_CHIPS = 4;
const MARGEN_DERECHO_DE_CHIPS = 6;
const HOLGURA_ANTES_DE_CHIPS = 12;

/** De izquierda a derecha en el orden de `keys`; vacio fuera de una Vista ER (`metricas.marcasDeClave`). */
export function chipsDeClaves(atributo: Pick<Atributo, 'keys'>, metricas: Pick<Metricas, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): ChipDeClave[] {
  if (metricas.marcasDeClave !== true || atributo.keys === undefined) return [];
  const tamano = metricas.tamanoDeFila?.key ?? Math.round(metricas.fontSize * metricas.escalaAtributo * 0.8 * 10) / 10;
  const ancho = Math.ceil(2 * tamano * 0.62 + 8);
  const n = atributo.keys.length;
  return atributo.keys.map((clave, i) => ({ clave, texto: clave.toUpperCase(), derecha: MARGEN_DERECHO_DE_CHIPS + (n - 1 - i) * (ancho + SEPARACION_DE_CHIPS), width: ancho, tamano }));
}

/** Incluye la holgura que los separa del texto; 0 sin chips. */
export function anchoDeChips(atributo: Pick<Atributo, 'keys'>, metricas: Pick<Metricas, 'fontSize' | 'escalaAtributo' | 'marcasDeClave' | 'tamanoDeFila'>): number {
  const chips = chipsDeClaves(atributo, metricas);
  return chips.length === 0 ? 0 : HOLGURA_ANTES_DE_CHIPS + Math.max(...chips.map((c) => c.derecha + c.width));
}
