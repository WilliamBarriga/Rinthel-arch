/**
 * Disposicion de Slots (ADR 0008): el arbol del mini-layout. Una caja `row` o
 * `column` contiene Slots y otras cajas, con `gap` entre hijos, `pad` interior y
 * una alineacion opcional por hijo (`start`, `center`, `end`). El orden de los
 * hijos es el orden visual; un Slot que no aparece en el arbol no se pinta ni se
 * mide. Este modulo define la forma del arbol y valida el que escribe el Tema;
 * `slots.ts` lo coloca.
 */
import { CODIGOS } from 'canonico';

import { SLOTS, esSlot, sugerir, validarPropiedades } from './catalogo';
import type { DefinicionDePropiedad, ErrorDeCatalogo, NombreDeSlot } from './catalogo';

export const ALINEACIONES = ['start', 'center', 'end'] as const;
export type Alineacion = (typeof ALINEACIONES)[number];
export const DIRECCIONES = ['row', 'column'] as const;
export type Direccion = (typeof DIRECCIONES)[number];

/** Un Slot dentro de una caja. `align` coloca su lado corto en el eje cruzado; sin el, la caja decide. */
export interface HojaDeSlots {
  slot: NombreDeSlot;
  align?: Alineacion;
}

/** Caja del mini-layout: `row` reparte en horizontal, `column` en vertical. */
export interface CajaDeSlots {
  direccion: Direccion;
  gap: number;
  /** Margen interior a cada lado; `padY`, si esta, sustituye el de arriba y abajo. */
  pad: number;
  padY?: number;
  /** Caja minima (`min-width`, `min-height`), contando el margen interior; el contenido se reparte o centra dentro. */
  anchoMinimo?: number;
  altoMinimo?: number;
  /** Ancho libre que la caja reserva tras su contenido (`slack`); en la raiz sustituye la holgura por defecto de las Metricas. */
  holgura?: number;
  align?: Alineacion;
  hijos: ElementoDeSlots[];
}

export type ElementoDeSlots = HojaDeSlots | CajaDeSlots;

export const esCaja = (elemento: ElementoDeSlots): elemento is CajaDeSlots => 'hijos' in elemento;

/** Disposicion por defecto (Tema neutro): icono y titulo en una fila, Atributos debajo. */
export const DISPOSICION_POR_DEFECTO: CajaDeSlots = {
  direccion: 'column',
  gap: 0,
  pad: 0,
  hijos: [
    { direccion: 'row', gap: 6, pad: 0, hijos: [{ slot: 'icon' }, { slot: 'title' }] },
    { slot: 'attrs' },
  ],
};

/** Slots que solo valen en un Nodo hoja: un Grupo no muestra Atributos en su cabecera. */
export const SLOTS_SOLO_DE_NODO: readonly NombreDeSlot[] = ['attrs'];

/** Cabecera por defecto de un Grupo (Tema sin `group`): icono y titulo en una fila con aire alrededor. */
export const CABECERA_POR_DEFECTO: CajaDeSlots = { direccion: 'row', gap: 6, pad: 6, hijos: [{ slot: 'icon' }, { slot: 'title' }] };

/** Los Slots de la disposicion, en orden visual (los repetidos solo cuentan una vez). */
export function slotsDe(caja: CajaDeSlots): NombreDeSlot[] {
  const vistos = new Set<NombreDeSlot>();
  const recorrer = (c: CajaDeSlots): void => {
    for (const hijo of c.hijos) {
      if (esCaja(hijo)) recorrer(hijo);
      else vistos.add(hijo.slot);
    }
  };
  recorrer(caja);
  return [...vistos];
}

/** Alineacion que el Tema fijo para un Slot (`undefined`: la de la caja que lo contiene). */
export function alineacionDe(caja: CajaDeSlots, slot: NombreDeSlot): Alineacion | undefined {
  for (const hijo of caja.hijos) {
    if (esCaja(hijo)) {
      const dentro = alineacionDe(hijo, slot);
      if (dentro !== undefined) return dentro;
    } else if (hijo.slot === slot) return hijo.align;
  }
  return undefined;
}

/**
 * La disposicion en la sintaxis del DSL (`column { row gap 6 { icon title } attrs }`), solo con las
 * propiedades que difieren del defecto. Es lo que muestra `inspect tema`.
 */
export function describirDisposicion(caja: CajaDeSlots): string {
  const propiedades = [
    caja.gap > 0 ? `gap ${caja.gap}` : '',
    caja.pad > 0 ? `pad ${caja.pad}` : '',
    caja.padY !== undefined ? `pad-y ${caja.padY}` : '',
    caja.anchoMinimo !== undefined ? `min-width ${caja.anchoMinimo}` : '',
    caja.altoMinimo !== undefined ? `min-height ${caja.altoMinimo}` : '',
    caja.holgura !== undefined ? `slack ${caja.holgura}` : '',
    caja.align !== undefined ? `align ${caja.align}` : '',
  ].filter((p) => p !== '');
  const hijos = caja.hijos.map((hijo) => (esCaja(hijo) ? describirDisposicion(hijo) : hijo.align === undefined ? hijo.slot : `${hijo.slot} align ${hijo.align}`));
  return `${[caja.direccion, ...propiedades].join(' ')} { ${hijos.join(' ')} }`;
}

const opcional = <K extends string>(clave: K, valor: number | string | undefined): Partial<Record<K, number>> =>
  (valor === undefined ? {} : { [clave]: Number(valor) }) as Partial<Record<K, number>>;

const ALINEACION: DefinicionDePropiedad = { tipo: 'opcion', valores: ALINEACIONES, defecto: 'start' };
const PROPIEDADES_DE_CAJA = {
  gap: { tipo: 'numero', min: 0, max: 64, defecto: 0 },
  pad: { tipo: 'numero', min: 0, max: 64, defecto: 0 },
  'pad-y': { tipo: 'numero', min: 0, max: 64, opcional: true },
  'min-width': { tipo: 'numero', min: 0, max: 1200, opcional: true },
  'min-height': { tipo: 'numero', min: 0, max: 600, opcional: true },
  slack: { tipo: 'numero', min: 0, max: 400, opcional: true },
  align: ALINEACION,
} as const satisfies Record<string, DefinicionDePropiedad>;

/** Propiedad `clave valor` escrita por el Tema; `ref` la situa en el texto. */
export interface PropiedadEscrita<R = unknown> {
  clave: string;
  valor: string | number;
  ref: R;
}

/** Entrada sin validar de una caja, tal como la escribe el Tema; `ref` vuelve en cada error para situarlo en el texto. */
export interface EntradaDeCaja<R = unknown> {
  ref: R;
  direccion: string;
  /** `gap`, `pad`, `pad-y`, `min-width`, `min-height`, `slack` y `align` (otra clave es error). */
  props: ReadonlyArray<PropiedadEscrita<R>>;
  hijos: Array<EntradaDeCaja<R> | EntradaDeSlot<R>>;
}

export interface EntradaDeSlot<R = unknown> {
  ref: R;
  slot: string;
  /** Alineacion escrita para el Slot, si hay. */
  align?: PropiedadEscrita<R>;
}

export type ErrorDeDisposicion<R> = ErrorDeCatalogo & { ref: R };

/**
 * Valida el arbol escrito por el Tema contra el catalogo (direcciones, claves
 * de caja, Slots conocidos y sin repetir, alineaciones, rangos) y devuelve la
 * disposicion con todos los errores a la vez, cada uno con sugerencia.
 */
export function construirDisposicion<R>(entrada: EntradaDeCaja<R>, elemento: 'nodo' | 'grupo' = 'nodo'): { disposicion?: CajaDeSlots; errores: Array<ErrorDeDisposicion<R>> } {
  const errores: Array<ErrorDeDisposicion<R>> = [];
  const vistos = new Set<string>();
  /** Valida `props` contra `propiedades`; los errores llevan el `ref` de la propiedad culpable o `respaldo`. */
  const propiedades = (articulo: string, nombre: string, definidas: Record<string, DefinicionDePropiedad>, props: ReadonlyArray<PropiedadEscrita<R>>, respaldo: R): Record<string, number | string> => {
    const resultado = validarPropiedades({ sujeto: `${articulo} ${nombre}`, nombre, propiedades: definidas }, props, {});
    for (const e of resultado.errores) errores.push({ ...e, ref: props.find((p) => p.clave === e.clave)?.ref ?? respaldo });
    return resultado.propiedades;
  };
  const alineacion = (props: Record<string, number | string>, escritas: ReadonlyArray<PropiedadEscrita<R>>): Alineacion | undefined =>
    escritas.some((p) => p.clave === 'align') ? (props['align'] as Alineacion | undefined) : undefined;
  const caja = (c: EntradaDeCaja<R>): CajaDeSlots => {
    if (!(DIRECCIONES as readonly string[]).includes(c.direccion)) {
      errores.push({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `Direccion '${c.direccion}' desconocida; usa ${DIRECCIONES.join(' o ')}`, ref: c.ref, ...sugerir(c.direccion, DIRECCIONES) });
    }
    const props = propiedades('La caja', `'${c.direccion}'`, PROPIEDADES_DE_CAJA, c.props, c.ref);
    const hijos: ElementoDeSlots[] = [];
    for (const h of c.hijos) {
      if (!('slot' in h)) {
        hijos.push(caja(h));
      } else if (!esSlot(h.slot)) {
        errores.push({ codigo: CODIGOS.E_THEME_UNKNOWN_SLOT, mensaje: `Slot '${h.slot}' desconocido; disponibles: ${SLOTS.join(', ')}`, ref: h.ref, ...sugerir(h.slot, SLOTS) });
      } else if (elemento === 'grupo' && SLOTS_SOLO_DE_NODO.includes(h.slot)) {
        errores.push({ codigo: CODIGOS.E_THEME_UNKNOWN_SLOT, mensaje: `El Slot '${h.slot}' no vale en un Grupo: solo en un Nodo hoja`, ref: h.ref });
      } else if (vistos.has(h.slot)) {
        errores.push({ codigo: CODIGOS.E_THEME_UNKNOWN_SLOT, mensaje: `Slot '${h.slot}' repetido`, ref: h.ref });
      } else {
        vistos.add(h.slot);
        const escritas = h.align === undefined ? [] : [h.align];
        const a = alineacion(propiedades('El Slot', `'${h.slot}'`, { align: ALINEACION }, escritas, h.ref), escritas);
        hijos.push({ slot: h.slot, ...(a !== undefined && { align: a }) });
      }
    }
    const a = alineacion(props, c.props);
    return {
      direccion: c.direccion === 'row' ? 'row' : 'column',
      gap: Number(props['gap'] ?? 0),
      pad: Number(props['pad'] ?? 0),
      ...opcional('padY', props['pad-y']),
      ...opcional('anchoMinimo', props['min-width']),
      ...opcional('altoMinimo', props['min-height']),
      ...opcional('holgura', props['slack']),
      ...(a !== undefined && { align: a }),
      hijos,
    };
  };
  const disposicion = caja(entrada);
  return errores.length > 0 ? { errores } : { disposicion, errores };
}
