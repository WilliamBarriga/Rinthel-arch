/**
 * Lo que un Nodo aporta a la colocacion de Slots y que Slots muestra el Tema.
 * Modulo hoja: lo usan `metricas` y `slots` sin depender uno del otro.
 */

import type { Atributo, ClaveDeAtributo, NodoResuelto } from 'canonico';

import type { NombreDeSlot } from './catalogo';
import { slotsDe } from './disposicion';
import type { CajaDeSlots } from './disposicion';
import type { Metricas } from './metricas';

/** Lo que un Nodo aporta a la colocacion: su titulo, sus Atributos visibles y si tiene icono. */
export interface ContenidoDeNodo {
  titulo: string;
  atributos: readonly Atributo[];
  icono: boolean;
  /** Tipo de nodo (Slot `badge`). */
  tipo?: string;
  /** Descripcion del Nodo (Slot `desc`); vacia: el Slot no reserva espacio. */
  descripcion?: string;
  /** Primera fuente del Nodo (Slot `footer`). */
  fuente?: string;
  /** Hijos que esconde un Grupo colapsado (Slot `counter`); solo existe en el colapsado. */
  cuenta?: number;
}

/**
 * Atributos que un Nodo muestra como filas: solo los de un Nodo hoja (un Grupo
 * abierto contiene Nodos; uno colapsado es hoja) y solo si el Tema lista el Slot
 * `attrs`. Una sola regla para `layout` (tamano y puertos) y `render` (dibujo).
 */
export function atributosVisibles(
  nodo: Pick<NodoResuelto, 'children' | 'attributes'>,
  metricas: Pick<Metricas, 'disposicion'>,
): readonly Atributo[] {
  return nodo.children.length === 0 && muestra(metricas, 'attrs') ? nodo.attributes : [];
}

const listas = new WeakMap<CajaDeSlots, readonly NombreDeSlot[]>();

/** Si la disposicion del Tema incluye el Slot (memoizado por disposicion: se consulta por cada Nodo). */
export function muestra(metricas: Pick<Metricas, 'disposicion'>, slot: NombreDeSlot): boolean {
  let lista = listas.get(metricas.disposicion);
  if (lista === undefined) listas.set(metricas.disposicion, (lista = slotsDe(metricas.disposicion)));
  return lista.includes(slot);
}

/** Lo que un Nodo aporta a la colocacion de Slots; una sola regla para `layout`, `render` y `shell`. */
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

/**
 * Texto de la fila de un Atributo; `render` escribe lo mismo. Con `marcas` (Vista ER) el tipo lleva `?` si el
 * Atributo es opcional; fuera de ER la marca se ignora.
 */
export function textoDeAtributo(atributo: Atributo, marcas = false): string {
  return `${atributo.name}: ${atributo.type}${marcas && atributo.optional === true ? '?' : ''}`;
}

/** Chip de una marca de clave en una fila ER: `derecha` es su distancia al borde derecho de la fila. */
export interface ChipDeClave {
  clave: ClaveDeAtributo;
  texto: string;
  derecha: number;
  width: number;
  /** Tamano de texto del chip. */
  tamano: number;
}

const SEPARACION_DE_CHIPS = 4;
const MARGEN_DERECHO_DE_CHIPS = 6;
const HOLGURA_ANTES_DE_CHIPS = 12;

/**
 * Chips de clave de la fila de un Atributo, de izquierda a derecha en el orden de `keys`, solo en una Vista ER
 * (`metricas.marcasDeClave`). Una sola colocacion para `tema` (ancho de la fila) y `render` (dibujo).
 */
export function chipsDeClaves(atributo: Pick<Atributo, 'keys'>, metricas: Pick<Metricas, 'fontSize' | 'escalaAtributo' | 'marcasDeClave'>): ChipDeClave[] {
  if (metricas.marcasDeClave !== true || atributo.keys === undefined) return [];
  const tamano = Math.round(metricas.fontSize * metricas.escalaAtributo * 0.8 * 10) / 10;
  const ancho = Math.ceil(2 * tamano * 0.62 + 8);
  const n = atributo.keys.length;
  return atributo.keys.map((clave, i) => ({ clave, texto: clave.toUpperCase(), derecha: MARGEN_DERECHO_DE_CHIPS + (n - 1 - i) * (ancho + SEPARACION_DE_CHIPS), width: ancho, tamano }));
}

/** Ancho que los chips de clave suman a la fila (con la holgura que los separa del texto); 0 sin chips. */
export function anchoDeChips(atributo: Pick<Atributo, 'keys'>, metricas: Pick<Metricas, 'fontSize' | 'escalaAtributo' | 'marcasDeClave'>): number {
  const chips = chipsDeClaves(atributo, metricas);
  return chips.length === 0 ? 0 : HOLGURA_ANTES_DE_CHIPS + Math.max(...chips.map((c) => c.derecha + c.width));
}
